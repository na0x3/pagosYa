import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { templatesDir } from '@pagosya/store-templates';
import { LIBRARY_CATALOG, libraryAnswerSchema, validateLibraryLayout, type LayoutBlock, type LibraryFacts } from '../source-section-library';
import type { V2Context } from './v2-context';

/** V2 reuses the section library (spec docs/superpowers/specs/2026-11-14-v2-library-sections.md; owner 2026-11-14 «cant it just
 *  copy and reuse sections we already have» → «do it like that then»). The writer places tested library sections, filled with the
 *  store's real data, among the sections it designs; the platform checks every block as section fill does and draws it with the
 *  template's own code and styles, in the store's colours and fonts. */

/** Owner 2026-11-14 («more structured heroes»: full-width photo with the text on it, or headline + big photo split, with clear
 *  buttons and a row of real facts): the first screen is always one of these library covers. */
export const V2_HERO_TYPES = ['cover-full', 'hero-split', 'cover-split'] as const;
/** Sections a V2 home never takes from the library: its own catalogue/cards are the platform's grid, and the template's frame. */
const LEFT_OUT = new Set(['products-grid']);

export type V2LibraryEntry = { slot: string; block: Record<string, unknown> };

export function v2LibraryCatalogText(): string {
  return LIBRARY_CATALOG.filter(section => !LEFT_OUT.has(section.id)).map(section => {
    const needs = Object.entries(section.needs).map(([key, value]) => `${key}=${Array.isArray(value) ? value.join('–') : value}`).join(', ');
    // One short line each (owner 2026-11-14 «half of the limit for 2 stores»): the first sentence of what it is for.
    const use = section.use.split(/(?<=[.:;])\s/)[0].slice(0, 120);
    return `- ${section.id} (${section.role}${needs ? `; ${needs}` : ''}): ${use}`;
  }).join('\n');
}

/** The store facts a library block may use, without the photos (the writer already has them, in the same order). */
export function v2LibraryFactsText(facts: LibraryFacts): string {
  const { photos: _photos, ...rest } = facts;
  return JSON.stringify(rest);
}

export function v2LibrarySchema(photoCount: number): object {
  const block = (libraryAnswerSchema(photoCount) as { properties: { blocks: { items: object } } }).properties.blocks.items;
  return { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['slot', 'block'], properties: { slot: { type: 'string' }, block } } };
}

/** The V2 photos as the library's photo list: block photo indexes are the writer's photo order, and come back as assets/ paths. */
export function v2LibraryFacts(facts: LibraryFacts, context: Pick<V2Context, 'photos'>): LibraryFacts {
  return { ...facts, photos: context.photos.map(photo => ({ url: photo.path, width: photo.width })) };
}

/** Every library section is open to V2, the way the store composer opens a template's (52 of 92 are «templateOnly», live round 4:
 *  strip-velocity and photo-scroller were refused without this). */
const COMPOSED = { allowed: LIBRARY_CATALOG.map(section => section.id), looks: Object.fromEntries(LIBRARY_CATALOG.map(section => [section.id, section.looks ?? []])) };

const slotName = (value: unknown) => String(value ?? '').trim().replace(/[^a-z0-9-]/gi, '').slice(0, 24);

/** Each photo once across the home (live round 4: «la misma foto aparece dos veces» was the last problem of both test stores — each
 *  block is checked alone, and the fix could not see which slot used which photo). The hero picks first; a photo the written
 *  sections already show (`taken`, assets/ paths) or an earlier block took is swapped for the next unused one, while any is left. */
export function withUniquePhotos(entries: readonly V2LibraryEntry[], facts: Pick<LibraryFacts, 'photos'>, taken: readonly string[] = []): V2LibraryEntry[] {
  const count = facts.photos.length;
  const used = new Set<number>(facts.photos.flatMap((photo, index) => taken.includes(photo.url) ? [index] : []));
  const take = (value: unknown) => {
    if (typeof value !== 'number' || value < 0 || value >= count) return value;
    if (!used.has(value)) { used.add(value); return value; }
    const other = [...Array(count).keys()].find(index => !used.has(index));
    if (other === undefined) return value;
    used.add(other); return other;
  };
  const ordered = [...entries].sort((a, b) => Number(slotName(b.slot) === 'hero') - Number(slotName(a.slot) === 'hero'));
  return ordered.map(entry => {
    const block: Record<string, unknown> = { ...entry.block };
    for (const key of ['photo', 'photo2']) if (key in block) block[key] = take(block[key]);
    if (Array.isArray(block.items)) block.items = block.items.map(item => item && typeof item === 'object' && 'photo' in item ? { ...item, photo: take((item as { photo?: unknown }).photo) } : item);
    return { ...entry, block };
  });
}

/** Each block checked on its own (real photos, products, codes, text caps, needs); what does not pass is left out, with why. The
 *  hero falls back to a plain cover-split from the store's own words and first photo when the writer's does not pass. */
export function buildV2Library(entries: readonly V2LibraryEntry[], facts: LibraryFacts, context: Pick<V2Context, 'storeName' | 'tagline' | 'categories'>, taken: readonly string[] = []):
  { blocks: Record<string, LayoutBlock>; order: string[]; dropped: Record<string, string> } {
  const blocks: Record<string, LayoutBlock> = {}, dropped: Record<string, string> = {}, order: string[] = [];
  for (const entry of withUniquePhotos(entries, facts, taken)) {
    const slot = slotName(entry.slot);
    if (!slot || blocks[slot] || dropped[slot]) continue;
    const type = String(entry.block?.type ?? '');
    if (slot === 'hero' && !(V2_HERO_TYPES as readonly string[]).includes(type)) { dropped[slot] = `la portada debe ser ${V2_HERO_TYPES.join(', ')}`; continue; }
    if (LEFT_OUT.has(type)) { dropped[slot] = `${type} no se usa en V2 (los productos van con data-pagosya-catalog)`; continue; }
    // The validator builds a whole home around what it is given (a cover, the grid, a closing): the asked block is the one of its type.
    const checked = validateLibraryLayout({ blocks: [entry.block as never] }, facts, { composed: COMPOSED }).find(block => block.type === type);
    if (checked) { blocks[slot] = checked; order.push(slot); }
    else dropped[slot] = `«${type}» no pasó la revisión de datos (fotos, productos o textos que la tienda no tiene)`;
  }
  if (!blocks.hero && facts.photos.length) {
    const category = context.categories[0];
    const fallback = validateLibraryLayout({ blocks: [{ type: 'cover-split', title: context.tagline || context.storeName, text: '', cta: 'Ver productos', link: 'productos.html',
      ...(category ? { cta2: category, link2: `productos.html?f_categoria=${encodeURIComponent(category)}` } : {}), photo: 0,
      items: facts.services.slice(0, 3).map(service => ({ title: service.title, icon: service.icon })) } as never] }, facts, { composed: COMPOSED }).find(block => block.type === 'cover-split');
    if (fallback) { blocks.hero = fallback; order.unshift('hero'); delete dropped.hero; }
  }
  if (blocks.hero) { order.splice(order.indexOf('hero'), 1); order.unshift('hero'); }
  return { blocks: withoutRepeatedPhotos(blocks, order, taken), order, dropped };
}

/** A fix's library answer over the current one: same slot = replaced, a new slot = added (live round 4: a refused section could only
 *  be removed, which fought the library-first rule). */
export function mergeV2LibraryEntries(current: readonly V2LibraryEntry[], changed: readonly V2LibraryEntry[]): V2LibraryEntry[] {
  const out = [...current];
  for (const entry of changed) {
    const at = out.findIndex(existing => slotName(existing.slot) === slotName(entry.slot));
    if (at >= 0) out[at] = entry; else out.push(entry);
  }
  return out;
}

/** The design kit (owner 2026-11-14 «lets do that», the Amboras/v0/Lovable way): the parts every section — the library's and the
 *  writer's own — is built from, so sizes and spacing match across the page. The template's base parts (section, eyebrow, h2,
 *  display, buttons, link, actions, grid) plus these. Colours and letters come from the design's --kit-* tokens. */
export const V2_KIT_EXTRA = `.es-lead{margin:16px 0 0;max-width:56ch;font:400 clamp(16px,1.35vw,19px)/1.6 var(--es-body);opacity:.82}
.es-grid--2{grid-template-columns:repeat(2,minmax(0,1fr))}.es-grid--3{grid-template-columns:repeat(3,minmax(0,1fr))}
@media (max-width:760px){.es-grid,.es-grid--2,.es-grid--3{grid-template-columns:minmax(0,1fr)}}
.es-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(32px,6vw,96px);align-items:center}
@media (max-width:760px){.es-split{grid-template-columns:minmax(0,1fr)}}
.es-media{display:block;width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;border-radius:var(--es-radius,12px)}
.es-media--wide{aspect-ratio:3/2}.es-media--square{aspect-ratio:1/1}
.es-center{text-align:center}.es-center .es-lead{margin-left:auto;margin-right:auto}.es-center .es-actions{justify-content:center}
/* Motion (owner 2026-11-14 «can these stores have motion»): every section after the first settles gently into place as it scrolls in —
   CSS only, where the browser supports scroll timelines, and never for visitors who asked for less motion. Never hidden: a page
   captured without scrolling (thumbnails, previews, screenshots) showed blank sections when this faded them in (fresh NOA r3). */
@supports (animation-timeline: view()){@media (prefers-reduced-motion:no-preference){
main > :is(section,[data-lb-at],div):not(:first-child){animation:v2-rise linear both;animation-timeline:view();animation-range:entry 0% entry 35%}
@keyframes v2-rise{from{transform:translateY(22px)}to{transform:none}}}}`;

/** The kit's class list as the writer reads it. */
export const V2_KIT_TEXT = `KIT DE DISEÑO (tus secciones propias se arman SOLO con estas piezas; tamaños, márgenes y espacios ya están definidos y combinan
con las secciones de biblioteca; no les escribas CSS):
- <section className="es-section"> — cada sección propia (ancho, márgenes y aire). Fondo de color: añade tu clase solo con background.
- <p className="es-eyebrow"> etiqueta corta · <h2 className="es-h2"> título · <p className="es-lead"> texto.
- <div className="es-actions"> con <a className="es-btn es-btn--accent|es-btn--ink|es-btn--ghost"> o <a className="es-link">.
- Retículas: es-grid (4 columnas), es-grid--3, es-grid--2, es-split (texto y foto lado a lado). Centrado: es-center.
- Fotos: <img className="es-media | es-media es-media--wide | es-media es-media--square" />.
Tu CSS solo puede dar color de fondo a tus secciones y acomodar lo que el kit no tiene (posición de elementos dentro de tu
composición). Nunca font-size, padding, margin o max-width para títulos, textos, botones o secciones: eso es del kit.`;

/** Each photo once across the checked blocks too (live Lullu r3: the store ran out of photos and the basket showed three times):
 *  a later block that repeats a photo drops it — the sections draw nothing they have no content for. The hero keeps its own;
 *  `taken` = photos the written sections already show. */
export function withoutRepeatedPhotos(blocks: Record<string, LayoutBlock>, order: readonly string[], taken: readonly string[] = []): Record<string, LayoutBlock> {
  const seen = new Set<string>(taken.filter(path => path !== blocks.hero?.photo));
  const out: Record<string, LayoutBlock> = {};
  for (const slot of order) {
    const block: LayoutBlock = { ...blocks[slot] };
    for (const key of ['photo', 'photo2'] as const) {
      const photo = block[key];
      if (!photo) continue;
      if (seen.has(photo) && slot !== 'hero') delete block[key]; else seen.add(photo);
    }
    if (block.items) block.items = block.items.map(item => {
      if (!item.photo) return item;
      if (seen.has(item.photo)) { const { photo: _photo, ...rest } = item; return rest; }
      seen.add(item.photo); return item;
    });
    out[slot] = block;
  }
  return out;
}

export const V2_LIBRARY_FILE = 'components/v2-library.tsx';

/** The generated component the written home imports: <LibrarySlot name="…" /> draws that slot's checked block. */
export function v2LibraryFile(library: ReturnType<typeof buildV2Library>): { path: typeof V2_LIBRARY_FILE; content: string } {
  return { path: V2_LIBRARY_FILE, content: `// Generated by the platform (V2 library sections, spec 2026-11-14): tested sections filled with this store's real data.
import { LibraryBlockView, LibraryScript, type LibraryBlock } from './library';

const BLOCKS: Record<string, LibraryBlock> = ${JSON.stringify(library.blocks, null, 2)};
const ORDER: string[] = ${JSON.stringify(library.order)};
/** Slots the writer asked for that did not pass the data check, and why. */
export const DROPPED: Record<string, string> = ${JSON.stringify(library.dropped)};

export function LibrarySlot({ name }: { name: string }) {
  const block = BLOCKS[name];
  if (!block) return null;
  const index = ORDER.indexOf(name);
  return <>{index === 0 ? <LibraryScript /> : null}<LibraryBlockView block={block} index={index} /></>;
}
` };
}

/** The slots a generated library file holds and the ones it dropped (read back by the contract checks). */
export function readV2LibraryFile(content: string): { slots: string[]; dropped: Record<string, string>; blocks: Record<string, LayoutBlock> } {
  const order = /const ORDER: string\[\] = (\[[^\n]*\]);/.exec(content)?.[1];
  const dropped = /export const DROPPED: Record<string, string> = (\{[^\n]*\});/.exec(content)?.[1];
  const blocks = /const BLOCKS: Record<string, LibraryBlock> = ([\s\S]*?);\nconst ORDER/.exec(content)?.[1];
  try { return { slots: order ? JSON.parse(order) : [], dropped: dropped ? JSON.parse(dropped) : {}, blocks: blocks ? JSON.parse(blocks) : {} }; } catch { return { slots: [], dropped: {}, blocks: {} }; }
}

/** The library's code, fresh from the template package (a store's own copy may predate LibraryBlockView). */
export function v2LibrarySources(): Array<{ path: string; content: string }> {
  const dir = join(templatesDir, 'esencial', 'components');
  return ['library.tsx', 'icons.tsx'].map(name => ({ path: `components/${name}`, content: readFileSync(join(dir, name), 'utf8') }));
}

/** The token bridge: the library's --es-* from the design's --kit-* (the base twins point at --kit-* too, so a band that swaps
 *  --es-* never loops). */
const TOKEN_BRIDGE = `:root{--es-paper:var(--kit-paper,#fff);--es-ink:var(--kit-ink,#111);--es-muted:var(--kit-muted,#f3f1ec);--es-accent:var(--kit-accent,#111);--es-on-accent:var(--kit-on-accent,#fff);--es-radius:var(--kit-radius,12px);--es-deep:var(--kit-deep,var(--kit-ink,#111));--es-on-deep:var(--kit-on-deep,var(--kit-paper,#fff));--es-base-paper:var(--kit-paper,#fff);--es-base-ink:var(--kit-ink,#111);--es-base-muted:var(--kit-muted,#f3f1ec);--es-base-accent:var(--kit-accent,#111);--es-base-on-accent:var(--kit-on-accent,#fff);--es-base-deep:var(--kit-deep,var(--kit-ink,#111));--es-base-on-deep:var(--kit-on-deep,var(--kit-paper,#fff));--es-heading:var(--kit-display,inherit);--es-body:var(--kit-text,inherit);--es-mono:ui-monospace,SFMono-Regular,Menlo,monospace}
/* The template sets titles' letter globally (h1–h3 → --es-heading), outside the library rules this sheet keeps (live round 4: every
   library title fell back to the body letter, «usa otra letra que el titular»). */
[data-lb-at] :where(h1,h2,h3),.lb-title,.es-display{font-family:var(--es-heading)}`;
/** After the library's rules (they set .es-section's 24px themselves): the themes' wider margins (owner 2026-11-14 «everything is
 *  very close up to the borders»). */
const after = () => `.es-section,[data-lb-at] [class$="__inner"]{padding-left:clamp(24px,6vw,96px);padding-right:clamp(24px,6vw,96px)}
${V2_KIT_EXTRA}`;

let cachedCss = '';
/** The library's styles from the template package: every rule about .lb-* / data-lb-* and the lb-* keyframes, nothing of the
 *  template's frame or themes, behind the token bridge. */
export function v2LibraryCss(): string {
  if (cachedCss) return cachedCss;
  const sheet = readFileSync(join(templatesDir, 'esencial', 'styles', 'globals.css'), 'utf8');
  const root = postcss.parse(sheet);
  // Library sections also draw with the template's shared parts (live round 4: unstyled eyebrows, bare «Ver ↗» links, no margins):
  // eyebrow, h2, grid, buttons, links, display, actions, section, scroll, band, still and the library's own card.
  const library = /\.lb-|\[data-lb-|\.es-(eyebrow|h2|grid|btn|link|display|actions|section|scroll|band|still|card)\b/;
  root.walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /keyframes/i.test((rule.parent as postcss.AtRule).name)) return;
    const kept = rule.selectors.filter(selector => library.test(selector) && !/\[data-(es-)?theme|html\[|\.es-(header|footer|shell)/.test(selector));
    if (!kept.length) rule.remove(); else if (kept.length !== rule.selectors.length) rule.selectors = kept;
  });
  root.walkAtRules(atRule => {
    if (/keyframes/i.test(atRule.name)) { if (!/^lb-/.test(atRule.params)) atRule.remove(); return; }
    if (/^(font-face|import|charset|property|layer)$/i.test(atRule.name)) atRule.remove();
  });
  root.walkAtRules(atRule => { if (atRule.nodes && !atRule.nodes.length) atRule.remove(); });
  root.walkComments(comment => { comment.remove(); });
  cachedCss = `/* v2:library — the section library's styles (template package), in this store's tokens */\n${TOKEN_BRIDGE}\n${root.toString().replace(/\n{2,}/g, '\n')}\n${after()}\n/* /v2:library */`;
  return cachedCss;
}
