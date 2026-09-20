import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as ts from 'typescript';
import { parseFragment, parse } from 'parse5';
import postcss from 'postcss';
import type { SourceProjectFileDto as File } from './dto/save-source-project.dto';
import { sourceHomeRegions } from './source-edit-scope';

export type SourceVisualField = { id: string; path: string; label: string; kind: 'text' | 'image' | 'color' | 'select'; value: string; previewValue?: string; options?: string[]; optionLabels?: Record<string, string> };
type Editable = SourceVisualField & { start: number; end: number; format: 'jsx-text' | 'js-string' | 'html-text' | 'html-attribute' | 'css' | 'section' | 'image-position' };
const TEXT_PROPS = new Set(['title', 'eyebrow', 'lead', 'body', 'blurb', 'tagline', 'alt', 'label', 'beforeLabel', 'afterLabel', 'note']);
const COLOR_PROPS = new Set(['paper', 'ink', 'accent', 'onAccent', 'surface']);
const FONT_CHOICES = [
  { value: '"Bricolage Grotesque", sans-serif', family: 'Bricolage Grotesque', asset: 'bricolage', weight: '200 800' },
  { value: '"Fraunces", serif', family: 'Fraunces', asset: 'fraunces', weight: '100 900' },
  { value: '"Instrument Sans", sans-serif', family: 'Instrument Sans', asset: 'instrument', weight: '400 700' },
  { value: '"Oswald", sans-serif', family: 'Oswald', asset: 'oswald', weight: '200 700' },
  { value: '"Instrument Serif", serif', family: 'Instrument Serif', asset: 'instrument-serif', weight: '400' },
];
const IMAGE_POSITIONS: Record<string, string> = { '0% 0%': 'Arriba izquierda', '50% 0%': 'Arriba centro', '100% 0%': 'Arriba derecha', '0% 50%': 'Centro izquierda', '50% 50%': 'Centro', '100% 50%': 'Centro derecha', '0% 100%': 'Abajo izquierda', '50% 100%': 'Abajo centro', '100% 100%': 'Abajo derecha' };
const COLORS = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;
const VARIANTS: Record<string, Record<string, string[]>> = {
  Hero: { variant: ['split', 'fullbleed', 'editorial', 'typographic'] },
  SiteHeader: { variant: ['classic', 'centered', 'split', 'floating'] },
  Catalog: { layout: ['grid', 'editorial', 'spotlight', 'rail', 'masonry'], card: ['classic', 'overlay', 'minimal', 'framed', 'caption'], fx: ['none', 'grow', 'zoom', 'lift', 'reveal', 'grow zoom', 'reveal zoom', 'reveal lift'] },
  Gallery: { variant: ['mosaic', 'grid', 'strip'] },
  Section: { tone: ['paper', 'surface', 'ink', 'accent'], space: ['none', 'sm', 'md', 'lg'], width: ['narrow', 'default', 'wide', 'full'] },
  SiteFooter: { tone: ['ink', 'paper'] },
  Button: { variant: ['solid', 'outline', 'ghost', 'link'], size: ['sm', 'md', 'lg'] },
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const decode = (value: string) => {
  const text = (node: any): string => node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join('');
  return text(parseFragment(value));
};
const label = (tag: string, value: string) => `${tag} · ${value.replace(/\s+/g, ' ').slice(0, 64)}`;
const normalizedAsset = (value: string) => value.replace(/^\//, '');

/** Enumerates literal display values only. Source is parsed, never executed. */
function editableFields(files: File[]): Editable[] {
  const result: Editable[] = [];
  const add = (file: File, start: number, end: number, kind: Editable['kind'], value: string, title: string, format: Editable['format'], options?: string[]) => {
    if (!value.trim() || value.length > 4000 || result.length >= 500) return;
    const hash = createHash('sha256').update(file.path).update('\0').update(file.content).digest('hex').slice(0, 20);
    result.push({ id: `${hash}:${start}:${end}:${kind}`, path: file.path, label: title, kind, value, previewValue: value.replace(/\s+/g, ' ').trim(), start, end, format, ...(options ? { options } : {}) });
    return result[result.length - 1];
  };
  for (const file of files) {
    if (file.encoding === 'base64') continue;
    if (/^components\/[\w./-]+\.tsx$/.test(file.path)) {
      const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const tagOf = (node: ts.Node): string => {
        let current: ts.Node | undefined = node;
        while (current) { if (ts.isJsxElement(current)) return current.openingElement.tagName.getText(source); if (ts.isJsxSelfClosingElement(current)) return current.tagName.getText(source); current = current.parent; }
        return 'Texto';
      };
      const protectedNode = (node: ts.Node) => {
        let current: ts.Node | undefined = node;
        while (current) {
          const opening = ts.isJsxElement(current) ? current.openingElement : ts.isJsxSelfClosingElement(current) ? current : null;
          if (opening && (/^(?:script|style|template|ProductDetail|CheckoutDetail|CommerceSlots)$/i.test(opening.tagName.getText(source)) || opening.attributes.properties.some(attr => ts.isJsxAttribute(attr) && /^(?:data-product|data-pagosya|data-cart|on[A-Z])/.test(attr.name.getText(source))))) return true;
          current = current.parent;
        }
        return false;
      };
      const imageObject = (node: ts.Node) => {
        let current: ts.Node | undefined = node.parent;
        while (current && !ts.isJsxAttribute(current)) { if (ts.isVariableDeclaration(current) || ts.isStatement(current)) return false; current = current.parent; }
        return Boolean(current && /^(?:image|images|poster|before|after|logo)$/.test((current as ts.JsxAttribute).name.getText(source)));
      };
      const tokenObject = (node: ts.Node) => {
        let current: ts.Node | undefined = node.parent;
        while (current) {
          if (ts.isJsxAttribute(current)) return current.name.getText(source) === 'tokens';
          if (ts.isVariableDeclaration(current)) return /tokens/i.test(current.name.getText(source)) || current.type?.getText(source) === 'StoreTokens';
          current = current.parent;
        }
        return false;
      };
      const visit = (node: ts.Node) => {
        if (protectedNode(node)) return;
        if (ts.isJsxText(node) && node.text.trim()) {
          const raw = file.content.slice(node.pos, node.end);
          const start = node.pos + raw.length - raw.trimStart().length;
          const end = node.end - (raw.length - raw.trimEnd().length);
          const value = decode(file.content.slice(start, end));
          add(file, start, end, 'text', value, label(tagOf(node), value), 'jsx-text');
        }
        if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression) && !ts.isJsxAttribute(node.parent)) {
          add(file, node.expression.getStart(source), node.expression.end, 'text', node.expression.text, label(tagOf(node), node.expression.text), 'js-string');
        }
        if (ts.isJsxAttribute(node) && node.initializer) {
          const attr = node.name.getText(source), tag = tagOf(node.parent.parent);
          const literal = ts.isStringLiteral(node.initializer) ? node.initializer : ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isStringLiteral(node.initializer.expression) ? node.initializer.expression : null;
          if (literal) {
            const options = VARIANTS[tag]?.[attr];
            const kind = (tag === 'img' && attr === 'src') || (tag === 'video' && attr === 'poster') ? 'image' : options ? 'select' : TEXT_PROPS.has(attr) || (tag === 'SiteHeader' && attr === 'name') ? 'text' : null;
            if (kind) add(file, literal.getStart(source), literal.end, kind, ts.isStringLiteral(node.initializer) ? decode(literal.text) : literal.text, `${tag} · ${attr}`, ts.isStringLiteral(node.initializer) ? 'html-attribute' : 'js-string', options);
          }
        }
        if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
          const property = node.name.getText(source).replace(/^['"]|['"]$/g, '');
          const literal = node.initializer;
          if ((property === 'src' || property === 'alt') && imageObject(node)) add(file, literal.getStart(source), literal.end, property === 'src' ? 'image' : 'text', literal.text, `${tagOf(node)} · ${property}`, 'js-string');
          if (property === 'position' && imageObject(node)) {
            const field = add(file, literal.getStart(source), literal.end, 'select', literal.text, `${tagOf(node)} · Encuadre`, 'js-string', [...new Set([literal.text, ...Object.keys(IMAGE_POSITIONS)])]);
            if (field) field.optionLabels = IMAGE_POSITIONS;
          }
          if (['displayFont', 'bodyFont'].includes(property) && tokenObject(node)) {
            const field = add(file, literal.getStart(source), literal.end, 'select', literal.text, `Tipografía · ${property === 'displayFont' ? 'Títulos' : 'Texto'}`, 'js-string', [...new Set([literal.text, ...FONT_CHOICES.map(font => font.value)])]);
            if (field) field.optionLabels = Object.fromEntries(FONT_CHOICES.map(font => [font.value, font.family]));
          }
          if (COLOR_PROPS.has(property) && tokenObject(node) && COLORS.test(literal.text)) add(file, literal.getStart(source), literal.end, 'color', literal.text, `Color · ${property}`, 'js-string');
        }
        if (ts.isObjectLiteralExpression(node) && imageObject(node) && node.properties.some(property => ts.isPropertyAssignment(property) && property.name.getText(source).replace(/^['"]|['"]$/g, '') === 'src' && ts.isStringLiteral(property.initializer)) && !node.properties.some(property => ts.isPropertyAssignment(property) && property.name.getText(source).replace(/^['"]|['"]$/g, '') === 'position') && !node.properties.some(ts.isSpreadAssignment)) {
          const field = add(file, node.end - 1, node.end - 1, 'select', '50% 50%', `${tagOf(node)} · Encuadre`, 'image-position', Object.keys(IMAGE_POSITIONS));
          if (field) field.optionLabels = IMAGE_POSITIONS;
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    } else if (/^(?:index|product|checkout|productos|coleccion)\.html$/.test(file.path)) {
      const visit = (node: any, blocked = false) => {
        const restricted = blocked || /^(?:script|style|template)$/.test(node.tagName || '') || (node.attrs || []).some((attr: any) => /^(?:data-product|data-pagosya|data-cart)/.test(attr.name));
        if (restricted) return;
        const location = node.sourceCodeLocation;
        if (node.nodeName === '#text' && node.value.trim() && location && !['head', 'title'].includes(node.parentNode?.tagName)) {
          const raw = file.content.slice(location.startOffset, location.endOffset);
          add(file, location.startOffset + raw.length - raw.trimStart().length, location.endOffset - (raw.length - raw.trimEnd().length), 'text', node.value.trim(), label(node.parentNode?.tagName || 'Texto', node.value), 'html-text');
        }
        for (const attr of node.attrs || []) {
          const attrLocation = location?.attrs?.[attr.name];
          const kind = node.tagName === 'img' && attr.name === 'src' ? 'image' : ['alt', 'title', 'aria-label'].includes(attr.name) ? 'text' : null;
          if (!kind || !attrLocation) continue;
          const raw = file.content.slice(attrLocation.startOffset, attrLocation.endOffset);
          const match = raw.match(/^[^=]+\s*=\s*(["'])([\s\S]*)\1$/);
          if (match) add(file, attrLocation.endOffset - match[2].length - 2, attrLocation.endOffset, kind, attr.value, `${node.tagName} · ${attr.name}`, 'html-attribute');
        }
        (node.childNodes || []).forEach((child: any) => visit(child, restricted));
      };
      visit(parse(file.content, { sourceCodeLocationInfo: true }));
    } else if (file.path === 'styles/globals.css' || file.path === 'styles.css') {
      const parsed = postcss.parse(file.content);
      parsed.walkDecls(declaration => {
        if (!declaration.prop.startsWith('--') || !COLORS.test(declaration.value) || declaration.parent?.type !== 'rule' || !(declaration.parent as postcss.Rule).selector.split(',').some(selector => selector.trim() === ':root')) return;
        const offset = declaration.source?.start?.offset;
        if (offset === undefined) return;
        const raw = file.content.slice(offset, declaration.source!.end!.offset! + 1);
        const start = offset + raw.indexOf(':') + 1 + raw.slice(raw.indexOf(':') + 1).length - raw.slice(raw.indexOf(':') + 1).trimStart().length;
        add(file, start, start + declaration.value.length, 'color', declaration.value, `Color · ${declaration.prop}`, 'css');
      });
    }
  }
  const assets = [...new Set([...files.filter(file => /^(?:\/?assets\/).+\.(?:png|jpe?g|webp|avif|gif)$/i.test(file.path)).map(file => '/' + normalizedAsset(file.path)), ...result.filter(field => field.kind === 'image').map(field => field.value)])];
  result.filter(field => field.kind === 'image').forEach(field => { field.options = assets; });
  const regions = sourceHomeRegions(files);
  const home = files.find(file => file.path === 'components/home.tsx');
  if (home && regions.length > 1 && new Set(regions.map(region => region.id)).size === regions.length) {
    regions.forEach((region, index) => {
      if (result.length >= 500) return;
      add(home, region.start, region.end, 'select', regions[index + 1]?.id || '__end__', `Mover sección «${region.id}» antes de`, 'section', [...regions.filter(other => other.id !== region.id).map(other => other.id), '__end__']);
      result[result.length - 1].optionLabels = { __end__: 'Al final' };
    });
  }
  return result;
}

export function sourceVisualFields(files: File[]): SourceVisualField[] {
  return editableFields(files).map(({ start, end, format, ...field }) => field);
}

export function applySourceVisualEdit(files: File[], fieldId: string, value: string): { files: File[]; label: string } {
  const field = editableFields(files).find(candidate => candidate.id === fieldId);
  if (!field) throw new BadRequestException('Este elemento cambió. Actualiza el panel visual e inténtalo de nuevo.');
  if (typeof value !== 'string' || !value.trim() || value.length > 4000) throw new BadRequestException('Escribe un valor de entre 1 y 4000 caracteres.');
  if (field.kind === 'color' && !COLORS.test(value)) throw new BadRequestException('Usa un color hexadecimal, por ejemplo #245344.');
  if ((field.kind === 'select' || field.kind === 'image') && !field.options?.includes(value)) throw new BadRequestException(field.kind === 'image' ? 'Elige una imagen existente del sitio.' : 'Elige una opción válida.');
  if (field.value === value) return { files, label: field.label };
  if (field.format === 'section') {
    const regions = sourceHomeRegions(files);
    const moved = regions.find(region => region.start === field.start)!;
    const ordered = regions.filter(region => region !== moved);
    const before = value === '__end__' ? ordered.length : ordered.findIndex(region => region.id === value);
    ordered.splice(before, 0, moved);
    const ids = ordered.map(region => region.id);
    const updated = files.map(file => {
      if (file.path === field.path) {
        let content = file.content;
        for (let index = regions.length - 1; index >= 0; index--) content = content.slice(0, regions[index].start) + ordered[index].text + content.slice(regions[index].end);
        return { ...file, content };
      }
      if (file.path === 'design-direction.json' || file.path === 'visual-system.json') {
        const manifest = JSON.parse(file.content);
        const layout = file.path === 'design-direction.json' ? manifest.concepts?.[manifest.selected]?.layout : manifest.layout;
        if (layout) {
          if (file.path === 'visual-system.json') layout.sectionOrder = ids;
          else { layout.sections = ids; layout.standaloneIntro = ids[0] !== layout.catalogSection; if (layout.standaloneIntro) layout.productsInOpening = false; }
        }
        return { ...file, content: JSON.stringify(manifest, null, 2) + '\n' };
      }
      return file;
    });
    return { files: updated, label: `Sección «${moved.id}» reordenada` };
  }
  const imagePrefix = files.find(file => file.path === field.path)!.content.slice(0, field.start).trimEnd().endsWith(',') ? '' : ',';
  const replacement = field.format === 'image-position' ? `${imagePrefix}position:${JSON.stringify(value)}` : field.format === 'jsx-text' ? `{${JSON.stringify(value)}}` : field.format === 'js-string' ? JSON.stringify(value) : field.format === 'html-attribute' ? `"${escapeHtml(value)}"` : field.format === 'html-text' ? escapeHtml(value) : value;
  const updated = files.map(file => file.path === field.path ? { ...file, content: file.content.slice(0, field.start) + replacement + file.content.slice(field.end) } : file);
  const font = field.label.startsWith('Tipografía · ') && FONT_CHOICES.find(choice => choice.value === value);
  if (font) {
    const marker = `/* pagosya-visual-font:${font.asset} */`;
    const css = updated.find(file => file.path === 'styles/globals.css');
    const declaration = `${marker}\n@font-face{font-family:"${font.family}";src:url('/assets/${font.asset}.ttf') format('truetype');font-style:normal;font-weight:${font.weight};font-display:swap}\n`;
    if (!css) updated.push({ path: 'styles/globals.css', content: declaration });
    else if (!css.content.includes(marker)) updated[updated.indexOf(css)] = { ...css, content: css.content + '\n' + declaration };
  }
  return { files: updated, label: `Edición visual · ${field.label}`.slice(0, 120) };
}
