#!/usr/bin/env node
/**
 * Spec 2026-10-20 Plantillas fill §3: moves every visible literal text of a template's components into flat `copy`
 * slots read from `./store-data`, so YAPI can fill a template in one call and a merchant can edit any text in place.
 * Developer-run, never at request time:  node tools/slotify.mjs <templateId>…  (writes the components and template.json).
 * Esencial is never converted: it already reads its words from data.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ts = createRequire(join(here, '../../../apps/api/package.json'))('typescript');

const FILES = { 'components/home.tsx': 'home', 'components/Shell.tsx': 'shell', 'components/product.tsx': 'product' };
const TEXT_ATTRS = new Set(['alt', 'title', 'label', 'placeholder']);
// As object properties `name` is a text (a category, a reviewer); these are the keys that never are.
const STRUCTURAL_PROPS = /^(?:className|href|src|srcSet|id|key|type|fill|stroke|transform|d|viewBox|style|role|rel|target|loading|sizes|tone|scale|slot|icon|color|kind|variant|image|img|photo|position|anchor|hash|section|url|link|to|value|width|height|ratio)$/;
const NOT_TEXT = /^[#./]|^https?:|\.html|^[a-z0-9_-]+$|^var\(|^\d/;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»' };
const decode = text => text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, body) => body[0] === '#'
  ? String.fromCodePoint(body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : Number(body.slice(1))) : ENTITIES[body.toLowerCase()] ?? match);
const letters = text => (text.match(/\p{L}/gu) || []).length >= 2;
const textLike = text => letters(text) && !NOT_TEXT.test(text.trim());

/** React's JSX text rule: each line trimmed at its inner edges, blank lines dropped, lines joined by one space. */
function jsxText(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  let last = -1;
  lines.forEach((line, index) => { if (/[^ \t]/.test(line)) last = index; });
  let out = '';
  lines.forEach((line, index) => {
    let piece = line.replace(/\t/g, ' ');
    if (index !== 0) piece = piece.replace(/^ +/, '');
    if (index !== lines.length - 1) piece = piece.replace(/ +$/, '');
    if (piece) out += piece + (index !== last ? ' ' : '');
  });
  return decode(out);
}

const ROLE_BY_TAG = { h1: 'headline', h2: 'title', h3: 'title', h4: 'title', h5: 'title', h6: 'title', a: 'cta', button: 'cta', label: 'label', span: 'label', small: 'label', strong: 'label', em: 'label', b: 'label', li: 'item', summary: 'question', blockquote: 'quote', dt: 'title', dd: 'body', figcaption: 'body' };
const ROLE_BY_PROP = { q: 'question', question: 'question', a: 'answer', answer: 'answer', quote: 'quote', name: 'name', who: 'name', author: 'name', alt: 'alt', title: 'title', t: 'title', heading: 'title', label: 'label', cta: 'cta' };

function convertFile(file, prefix) {
  const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const leftovers = [];
  const tagName = node => (ts.isJsxElement(node) ? node.openingElement.tagName : ts.isJsxSelfClosingElement(node) ? node.tagName : null)?.getText(source);
  const attributes = node => (ts.isJsxElement(node) ? node.openingElement.attributes : ts.isJsxSelfClosingElement(node) ? node.attributes : null)?.properties ?? [];
  const enclosingTag = node => { for (let n = node.parent; n; n = n.parent) { const tag = tagName(n); if (tag) return tag; } return ''; };
  const skipped = node => {
    for (let n = node; n; n = n.parent) {
      const tag = tagName(n);
      if (tag === 'template' || tag === 'script' || tag === 'style') return true;
      if (tag && attributes(n).some(attr => ts.isJsxAttribute(attr) && /^data-(?:product-field|pagosya-product-template)$/.test(attr.name.getText(source)))) return true;
      if (ts.isJsxAttribute(n) && !TEXT_ATTRS.has(n.name.getText(source))) return true;
      if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isTypeNode(n) || ts.isCallExpression(n) && n.expression.getText(source) !== 'String') return true;
    }
    return false;
  };
  const tagRole = tag => ROLE_BY_TAG[tag] ?? 'body';
  const push = (start, end, value, role, wrap) => found.push({ start, end, value, role, wrap });
  const visit = node => {
    if (ts.isJsxText(node)) {
      const value = jsxText(node.text);
      if (textLike(value) && !skipped(node)) push(node.pos, node.end, value, tagRole(enclosingTag(node)), true);
      return;
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && textLike(node.text) && !skipped(node.parent)) {
      const parent = node.parent, at = node.getStart(source);
      if (ts.isJsxAttribute(parent)) push(at, node.end, node.text, ROLE_BY_PROP[parent.name.getText(source)] ?? 'label', true);
      else if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
        const name = parent.name.getText(source).replace(/^['"]|['"]$/g, '');
        if (!STRUCTURAL_PROPS.test(name)) push(at, node.end, node.text, ROLE_BY_PROP[name] ?? 'body', false);
      }
      else if (ts.isArrayLiteralExpression(parent)) push(at, node.end, node.text, 'item', false);
      else if (ts.isBinaryExpression(parent) && parent.right === node && /^(?:\|\||\?\?)$/.test(parent.operatorToken.getText(source))) push(at, node.end, node.text, tagRole(enclosingTag(node)), false);
      else if (ts.isConditionalExpression(parent) && parent.condition !== node) push(at, node.end, node.text, tagRole(enclosingTag(node)), false);
      else if (ts.isJsxExpression(parent) && !ts.isJsxAttribute(parent.parent)) push(at, node.end, node.text, tagRole(enclosingTag(node)), false);
      else if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent) && TEXT_ATTRS.has(parent.parent.name.getText(source))) push(at, node.end, node.text, ROLE_BY_PROP[parent.parent.name.getText(source)] ?? 'label', false);
      return;
    }
    if (ts.isTemplateExpression(node) && !skipped(node.parent) && letters([node.head.text, ...node.templateSpans.map(span => span.literal.text)].join(' '))) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      leftovers.push(`${file.path}:${line} ${node.getText(source)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  found.sort((a, b) => a.start - b.start);
  // The first paragraph after a headline is its lead (kicker, h1, lead, button).
  found.forEach((slot, index) => { if (slot.role === 'body' && index && found[index - 1].role === 'headline') slot.role = 'lead'; });
  const slots = found.map((slot, index) => ({ ...slot, key: `${prefix}_${index + 1}`, max: Math.min(420, Math.max(12, Math.round(slot.value.length * 1.6))) }));
  let content = file.content;
  for (const slot of [...slots].sort((a, b) => b.start - a.start)) content = content.slice(0, slot.start) + (slot.wrap ? `{copy.${slot.key}}` : `copy.${slot.key}`) + content.slice(slot.end);
  if (slots.length) {
    const named = content.match(/import \{([^}]*)\} from '\.\/store-data';/);
    if (named) { if (!/\bcopy\b/.test(named[1])) content = content.replace(named[0], `import {${named[1].replace(/\s*$/, '')}, copy } from './store-data';`); }
    else content = `import { copy } from './store-data';\n` + content;
  }
  return { file: { ...file, content }, slots: slots.map(slot => ({ key: slot.key, role: slot.role, default: slot.value, max: slot.max })), leftovers };
}

/** Converts the given component files; other files pass through. */
export function slotifyFiles(files) {
  const out = [], slots = [], leftovers = [];
  for (const file of files) {
    const prefix = FILES[file.path];
    if (!prefix) { out.push(file); continue; }
    const converted = convertFile(file, prefix);
    out.push(converted.file); slots.push(...converted.slots); leftovers.push(...converted.leftovers);
  }
  return { files: out, slots, leftovers };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const id of process.argv.slice(2)) {
    if (id === 'esencial') { console.log('esencial: skipped (master template)'); continue; }
    const dir = join(here, '..', 'templates', id);
    const manifestPath = join(dir, 'template.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.copy) { console.log(`${id}: already converted`); continue; }
    const files = Object.keys(FILES).filter(path => existsSync(join(dir, path))).map(path => ({ path, content: readFileSync(join(dir, path), 'utf8') }));
    const result = slotifyFiles(files);
    for (const file of result.files) writeFileSync(join(dir, file.path), file.content);
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, copy: result.slots }, null, 2) + '\n');
    console.log(`${id}: ${result.slots.length} slots${result.leftovers.length ? `, ${result.leftovers.length} left literal:\n  ${result.leftovers.join('\n  ')}` : ''}`);
  }
}
