import { BadGatewayException } from '@nestjs/common';
import * as ts from 'typescript';
import postcss from 'postcss';
import { sourceRedesignRequested } from './source-context';
import type { SourceProjectFileDto as File } from './dto/save-source-project.dto';
import type { SourceDesign } from './source-design';

const currentRequest = (text: string) => text.split('Pedido actual del comercio:').at(-1)!.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const requestsImageChange = (text: string) => !/\b(?:no|sin|never|without|don't|do not)\b.{0,35}\b(?:cambi|quit|elimin|retir|sustit|reemplaz|ocult|remov|delet|replac|chang|hid)\w*.{0,35}\b(?:foto|imagen|photo|picture|image|galeria|gallery)/.test(currentRequest(text))
  && /\b(?:quita|elimina|retira|sustituye|reemplaza|cambia|oculta|remove|delete|replace|change|hide)\w*\b[^.!?\n]{0,65}\b(?:fotos?|imagenes?|photos?|pictures?|images?|galeria|gallery)\b/.test(currentRequest(text));
export const requestsArtwork = (text: string) => !/\b(?:sin|no|without)\b.{0,35}\b(?:dibuj|ilustr|drawing|artwork)/.test(currentRequest(text))
  && /\b(?:dibuja|dibujo|dibujos|ilustracion|ilustraciones|illustration|illustrations|artwork|stickers?|pegatinas?)\b/.test(currentRequest(text));
export class SourceScopeConflict extends BadGatewayException {
  constructor(detail: string) { super('El cambio excede lo solicitado: ' + detail + ' Conserva el diseño anterior fuera de la sección pedida.'); }
}
export function validateSourceArtwork(previous: File[], next: File[], instruction: string) {
  if (requestsArtwork(instruction) || /\b(?:iconos?|icons?|grafic[oa]s?|charts?|diagramas?|diagrams?)\b/.test(currentRequest(instruction))) return;
  const authored = (files: File[]) => files.filter(f => /\.(tsx|html|css)$/.test(f.path)).map(f => f.content).join('\n');
  const before = authored(previous), after = authored(next);
  const drawingCount = (text: string) => (text.match(/<(?:svg|canvas)\b/g) || []).length;
  const introducedAssets = [...after.matchAll(/assets\/creative\/[\w/.-]+/g)].map(m => m[0]).filter(path => !before.includes(path));
  if (drawingCount(after) > drawingCount(before) || introducedAssets.length) {
    throw new SourceScopeConflict('Se añadieron ilustraciones no solicitadas. Usa las fotos aprobadas y composición tipográfica.');
  }
}
type Region = { id: string; start: number; end: number; text: string };
const homePath = 'components/home.tsx';
const content = (files: File[], path: string) => files.find(f => f.path === path)?.content || '';

/** Literal direct sections are the existing React generation contract. Never execute source. */
export function sourceHomeRegions(files: File[]): Region[] {
  const code = content(files, homePath);
  const source = ts.createSourceFile(homePath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const regions: Region[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'main') {
      for (const child of node.children) {
        if (!ts.isJsxElement(child) && !ts.isJsxSelfClosingElement(child)) continue;
        const opening = ts.isJsxElement(child) ? child.openingElement : child;
        const attr = opening.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(source) === 'id') as ts.JsxAttribute | undefined;
        if (attr?.initializer && ts.isStringLiteral(attr.initializer)) {
          regions.push({ id: attr.initializer.text, start: child.getStart(source), end: child.end, text: child.getText(source) });
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return regions;
}
export type SectionScope = { add: boolean; targets: string[]; original: Region[] };
export function sourceSectionScope(files: File[], instruction: string): SectionScope | undefined {
  const task = currentRequest(instruction);
  if (sourceRedesignRequested(instruction) || !/\b(?:seccion|section)\b/.test(task) || !content(files, homePath)) return;
  const original = sourceHomeRegions(files);
  if (!original.length) throw new SourceScopeConflict('No pude delimitar las secciones de esta página.');
  const add = /\b(?:agrega|anade|crea\w*|haz|incorpora|add|create|insert|build)\b.{0,50}\b(?:seccion|section)\b/.test(task);
  if (add) return { add, targets: [], original };
  const stop = new Set(['seccion','section','cambia','change','mejora','improve','solo','only','esta','este','para','with','that','this','quiero','puedes','hacer','texto','text','titulo','title']);
  const words = task.match(/[a-z0-9-]{4,}/g)?.filter(w => !stop.has(w)) || [];
  const scores = original.map(region => {
    const heading = region.text.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/)?.[1].replace(/<[^>]*>/g, ' ') || '';
    const label = currentRequest(region.id.replace(/-/g, ' ') + ' ' + heading);
    return { id: region.id, score: words.filter(w => label.includes(w)).length };
  });
  const max = Math.max(...scores.map(s => s.score));
  const selected = scores.filter(s => s.score === max && s.score > 0);
  if (selected.length !== 1) throw new SourceScopeConflict('No pude identificar una única sección. Indica su título.');
  return { add: false, targets: [selected[0].id], original };
}
export function sourceSectionScopePrompt(scope?: SectionScope) {
  return scope ? 'ENFORCED SECTION SCOPE: ' + JSON.stringify({ add: scope.add, editableSectionIds: scope.targets, protectedSectionIds: scope.original.filter(r => !scope.targets.includes(r.id)).map(r => r.id) })
    + '. Keep every byte outside these literal main sections unchanged, including imports, Header, Footer and existing links. For an addition insert one literal section with a unique id in components/home.tsx and scoped CSS. Existing shared selectors and global styles are protected. Use new section-specific class names; do not draw replacement artwork or alter existing images. Navigation additions can be requested separately.' : '';
}
const roots = (text: string) => new Set([
  ...[...text.matchAll(/\bid=["']([^"']+)["']/g)].map(m => '#' + m[1]),
  ...[...text.matchAll(/\bclassName=["']([^"']+)["']/g)].flatMap(m => m[1].split(/\s+/).filter(c => /^[\w-]+$/.test(c)).map(c => '.' + c)),
]);
function protectedCss(css: string, allowed: Set<string>): string {
  const root = postcss.parse(css);
  const scoped = (selector: string) => selector.split(',').every(part => {
    const first = part.trim().match(/^[.#][\w-]+/)?.[0];
    return first && allowed.has(first);
  });
  root.walkRules(rule => { if (scoped(rule.selector)) rule.remove(); });
  root.walkComments(comment => { comment.remove(); });
  // Ignore formatting and empty responsive wrappers, not declarations or cascade order.
  root.walkAtRules(rule => { if (rule.nodes?.length === 0) rule.remove(); });
  return JSON.stringify(root.nodes.map(node => {
    const clean = (n: any): any => ({ type: n.type, ...(n.selector && { selector: n.selector }), ...(n.prop && { prop: n.prop, value: n.value, important: !!n.important }), ...(n.name && { name: n.name, params: n.params }), ...(n.nodes && { nodes: n.nodes.map(clean) }) });
    return clean(node);
  }));
}
export function validateSourceEditScope(previous: File[], next: File[], instruction: string, scope?: SectionScope) {
  if (!requestsImageChange(instruction)) {
    const authored = (files: File[]) => files.filter(f => /\.(tsx|html|css|js)$/.test(f.path) && !f.path.startsWith('_compiled/')).map(f => f.content).join('\n');
    const refs = (text: string) => new Set(text.match(/(?:\/?assets\/|\/v1\/uploads\/)[\w/.-]+\.(?:png|jpe?g|webp|avif|gif|mp4)/gi) || []);
    const after = refs(authored(next));
    for (const ref of refs(authored(previous))) if (!after.has(ref)) throw new SourceScopeConflict('Se retiró una foto o video existente sin que lo pidieras.');
  }
  if (!scope) return;
  const updated = sourceHomeRegions(next);
  const ids = updated.map(r => r.id);
  if (new Set(ids).size !== ids.length) throw new SourceScopeConflict('La sección nueva tiene un identificador repetido.');
  const extra = updated.filter(r => !scope.original.some(old => old.id === r.id));
  if (scope.add && extra.length !== 1) throw new SourceScopeConflict('Añade exactamente la sección solicitada.');
  if (!scope.add && extra.length) throw new SourceScopeConflict('Se añadieron secciones no solicitadas.');
  const oldOrder = scope.original.map(r => r.id);
  if (JSON.stringify(ids.filter(id => oldOrder.includes(id))) !== JSON.stringify(oldOrder)) throw new SourceScopeConflict('Se eliminaron o reordenaron secciones anteriores.');
  for (const old of scope.original) if (!scope.targets.includes(old.id) && updated.find(r => r.id === old.id)?.text !== old.text) {
    throw new SourceScopeConflict('Se modificó la sección protegida «' + old.id + '».');
  }
  const shell = (files: File[], regions: Region[]) => {
    let code = content(files, homePath);
    for (const r of [...regions].reverse()) code = code.slice(0, r.start) + (oldOrder.includes(r.id) ? '<section-protected-' + r.id + '/>' : '') + code.slice(r.end);
    return code.replace(/\s+/g, ' ').trim();
  };
  if (shell(previous, scope.original) !== shell(next, updated)) throw new SourceScopeConflict('Se cambió código fuera de las secciones autorizadas.');
  for (const file of previous.filter(f => f.path !== homePath && !f.path.endsWith('.css'))) {
    if (content(next, file.path) !== file.content) throw new SourceScopeConflict('Se modificó el componente protegido ' + file.path + '.');
  }
  for (const file of next) if (!previous.some(f => f.path === file.path) && file.path !== 'styles/globals.css') throw new SourceScopeConflict('Se añadió un archivo fuera de la sección autorizada.');
  const affected = updated.filter(r => scope.targets.includes(r.id) || extra.includes(r));
  const allowed = roots(affected.map(r => r.text).join('\n') + scope.original.filter(r => scope.targets.includes(r.id)).map(r => r.text).join('\n'));
  // Classes used outside the target stay protected even if the target also uses them.
  let homeOutside = content(next, homePath);
  for (const r of [...affected].reverse()) homeOutside = homeOutside.slice(0, r.start) + homeOutside.slice(r.end);
  const outside = next.filter(f => f.path.endsWith('.tsx') && f.path !== homePath).map(f => f.content).join('\n') + homeOutside;
  for (const root of roots(outside)) allowed.delete(root);
  for (const path of new Set([...previous, ...next].filter(f => f.path.endsWith('.css')).map(f => f.path))) {
    if (protectedCss(content(previous, path), allowed) !== protectedCss(content(next, path), allowed)) throw new SourceScopeConflict('Se cambiaron estilos globales o ajenos a la sección.');
  }
}
/** Refresh the selected layout only after its source edit passed scope validation. */
export function sourceDesignAfterSectionEdit(design: SourceDesign | undefined, files: File[], scope?: SectionScope): SourceDesign | undefined {
  if (!design || !scope) return design;
  const copy = structuredClone(design);
  const layout = copy.concepts[copy.selected].layout;
  if (layout) layout.sections = sourceHomeRegions(files).map(r => r.id);
  return copy;
}
