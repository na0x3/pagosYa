import * as ts from 'typescript';
import postcss from 'postcss';
import type { V2File } from './v2-context';

/** Owner 2026-11-14 («faster, cheaper, more reliable» — without touching creativity): a fix round of a written home rewrites only the
 *  sections the page checks named, not the whole page. Every check line carries its block of <main> as «[sección N] » (v2-run
 *  freeBlocking); the home's own sections are cut out of components/home.tsx by that order, the writer gets just them and the CSS
 *  their classes use, and its answer is put back in place. Anything this cannot place for sure (a check of the whole page, a library
 *  section, or a <main> child drawn by an expression) leaves the round to the full fix. */

export type HomeSection = { index: number; start: number; end: number; text: string; library: boolean };

const TAG = /^\[sección (\d+)\]\s*/;

/** The direct children of <main> in components/home.tsx, in order; null when one is an expression (it may draw nothing, so the order
 *  on the page and in the code could differ). */
export function homeSections(home: string): HomeSection[] | null {
  const source = ts.createSourceFile('home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let main: ts.JsxElement | undefined;
  const find = (node: ts.Node) => {
    if (!main && ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'main') main = node;
    if (!main) ts.forEachChild(node, find);
  };
  find(source);
  if (!main) return null;
  const out: HomeSection[] = [];
  for (const child of main.children) {
    if (ts.isJsxText(child)) { if (child.text.trim()) return null; continue; }
    if (ts.isJsxExpression(child)) { if (!child.expression) continue; return null; }
    if (!ts.isJsxElement(child) && !ts.isJsxSelfClosingElement(child)) return null;
    const tag = (ts.isJsxElement(child) ? child.openingElement : child).tagName.getText(source);
    const start = child.getStart(source), end = child.getEnd();
    out.push({ index: out.length, start, end, text: home.slice(start, end), library: tag === 'LibrarySlot' });
  }
  return out;
}

/** The check lines by section, and the ones that name no section. */
export function problemsBySection(lines: readonly string[]): { bySection: Map<number, string[]>; rest: string[] } {
  const bySection = new Map<number, string[]>(); const rest: string[] = [];
  for (const line of lines) {
    // «Escritorio: [sección 3] …» — the width comes first (v2-prototype inspect).
    const width = line.match(/^(Escritorio|Celular):\s*/)?.[0] ?? '';
    const tagged = line.slice(width.length).match(TAG);
    if (!tagged) { rest.push(line); continue; }
    const at = Number(tagged[1]);
    bySection.set(at, [...(bySection.get(at) ?? []), `${width}${line.slice(width.length + tagged[0].length)}`]);
  }
  return { bySection, rest };
}

export type SectionFixPlan = { sections: HomeSection[]; problems: Map<number, string[]> };

/** A plan when every problem names one of the home's own written sections; null hands the round to the full fix. */
export function sectionFixPlan(files: readonly V2File[], lines: readonly string[]): SectionFixPlan | null {
  if (!lines.length) return null;
  const home = files.find(file => file.path === 'components/home.tsx')?.content;
  if (!home) return null;
  const { bySection, rest } = problemsBySection(lines);
  if (rest.length || !bySection.size) return null;
  const all = homeSections(home);
  if (!all) return null;
  const sections = [...bySection.keys()].sort((a, b) => a - b).map(at => all[at]);
  if (sections.some(section => !section || section.library)) return null;
  return { sections, problems: bySection };
}

/** The class names a piece of JSX uses (className="…" and className={'…'} / {`…`} literals). */
export function classesIn(jsx: string): string[] {
  const names = new Set<string>();
  for (const match of jsx.matchAll(/className=(?:"([^"]*)"|'([^']*)'|\{\s*[`'"]([^`'"]*)[`'"]\s*\})/g)) for (const name of (match[1] ?? match[2] ?? match[3] ?? '').split(/\s+/)) if (/^[\w-]+$/.test(name)) names.add(name);
  return [...names];
}

/** The rules of the design's sheet that style these classes (with their @media), and its :root tokens — what the writer needs to see. */
export function cssFor(css: string, classes: readonly string[]): string {
  if (!classes.length) return '';
  const wanted = new RegExp(`\\.(?:${classes.map(name => name.replace(/[-]/g, '\\-')).join('|')})(?![\\w-])`);
  try {
    const root = postcss.parse(css);
    root.walkRules(rule => { if (!/^:root\b/.test(rule.selector) && !rule.selectors.some(selector => wanted.test(selector))) rule.remove(); });
    root.walkAtRules(atRule => { if (/^(font-face|import|keyframes)$/i.test(atRule.name) || (atRule.nodes && !atRule.nodes.length)) atRule.remove(); });
    return root.toString().replace(/\n{3,}/g, '\n\n').trim().slice(0, 24_000);
  } catch { return ''; }
}

export function v2SectionFixPrompt(rules: string): string {
  return `Eres quien escribió esta tienda. Algunas secciones de su portada no pasaron las revisiones de la página. Rehaces SOLO esas secciones,
con el mismo diseño, la misma marca y las mismas clases de la tienda, hasta que el problema desaparezca: arregla, no quites. Devuelves cada
sección completa (el elemento entero, desde su etiqueta de apertura hasta la de cierre, sin nada más alrededor) con su «index», en «css»
solo las reglas nuevas o que reemplazan a las anteriores (se añaden al final de la hoja: la última gana), y en «imports» las piezas de
@pagosya/ui que la sección use y que home.tsx aún no importa. No cambies textos verdaderos por inventados ni toques otras secciones.

Las reglas siguen siendo estas:

${rules}`;
}

export function v2SectionFixSchema(): object {
  return { type: 'object', additionalProperties: false, required: ['sections', 'css', 'imports', 'notes'], properties: {
    sections: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['index', 'jsx'], properties: { index: { type: 'integer', minimum: 0, maximum: 30 }, jsx: { type: 'string' } } } },
    css: { type: 'string' }, imports: { type: 'array', maxItems: 8, items: { type: 'string' } }, notes: { type: 'string' } } };
}

export function v2SectionFixInput(plan: SectionFixPlan, files: readonly V2File[]): string {
  const home = files.find(file => file.path === 'components/home.tsx')!.content;
  const css = files.find(file => file.path === 'styles/globals.css')?.content ?? '';
  const imports = home.split('\n').filter(line => /^\s*import\b/.test(line)).join('\n');
  return `IMPORTS DE home.tsx (lo que ya puedes usar):\n${imports}\n\n${plan.sections.map(section => `SECCIÓN index ${section.index} — PROBLEMAS:\n${(plan.problems.get(section.index) ?? []).map(line => `- ${line}`).join('\n')}\nSU CÓDIGO:\n${section.text}`).join('\n\n')}

LAS REGLAS DE LA HOJA QUE USAN ESTAS SECCIONES (y los tokens de :root):\n${cssFor(css, plan.sections.flatMap(section => classesIn(section.text)))}`;
}

/** Each kit piece a design may import (prompt «IMPORTS permitidos»). */
const UI_PARTS = new Set(['NavShell', 'CommerceSlots', 'ProductPageTemplate', 'KitSlot', 'Reveal', 'Parallax', 'Marquee', 'WordRotate', 'KineticHeadline', 'ScrollScale', 'Carousel']);

/** The home with the rewritten sections in place, the new CSS after the sheet and any new kit imports; null when the answer cannot be
 *  placed (an index it was not asked for, or code that is not one element). */
export function mergeSectionFix(files: readonly V2File[], plan: SectionFixPlan, raw: unknown): V2File[] | null {
  const answer = raw as { sections?: Array<{ index?: unknown; jsx?: unknown }>; css?: unknown; imports?: unknown } | null;
  if (!Array.isArray(answer?.sections)) return null;
  const asked = new Map(plan.sections.map(section => [section.index, section]));
  const changes = answer!.sections!.flatMap(entry => {
    const section = asked.get(Number(entry?.index));
    const jsx = typeof entry?.jsx === 'string' ? entry.jsx.trim() : '';
    return section && /^<[A-Za-z]/.test(jsx) && />$/.test(jsx) ? [{ section, jsx }] : [];
  });
  if (!changes.length || changes.length !== new Set(changes.map(change => change.section.index)).size) return null;
  const before = files.find(file => file.path === 'components/home.tsx')!.content;
  let home = before;
  for (const { section, jsx } of [...changes].sort((a, b) => b.section.start - a.section.start)) home = home.slice(0, section.start) + jsx + home.slice(section.end);
  // Still one element per section where it went (a stray closing tag would shift the rest).
  if ((homeSections(home)?.length ?? -1) !== (homeSections(before)?.length ?? -2)) return null;
  const wanted = (Array.isArray(answer!.imports) ? answer!.imports : []).map(String).filter(name => UI_PARTS.has(name));
  const ui = home.match(/import\s*\{([^}]*)\}\s*from\s*['"]@pagosya\/ui['"];?/);
  const have = new Set((ui?.[1] ?? '').split(',').map(name => name.trim()).filter(Boolean));
  const missing = wanted.filter(name => !have.has(name));
  if (missing.length) home = ui ? home.replace(ui[0], `import { ${[...have, ...missing].join(', ')} } from '@pagosya/ui';`) : `import { ${missing.join(', ')} } from '@pagosya/ui';\n${home}`;
  const css = typeof answer!.css === 'string' ? answer!.css.trim() : '';
  return files.map(file => file.path === 'components/home.tsx' ? { ...file, content: home }
    : file.path === 'styles/globals.css' && css ? { ...file, content: `${file.content.trimEnd()}\n\n/* Arreglos de sección */\n${css}\n` } : file);
}
