// apps/api/src/storefront-source/kit-touch.ts
/** Layer B of one look per store (spec 2026-10-14): one model call that carries the home page's own devices onto the kit's
 * product page, catalog, cards and cart as guarded CSS. Sanitized per surface, checked in a real browser, and a surface that
 * fails loses only its own CSS. Never fails a build: the caller treats null and empty CSS as "no touch". */
import postcss from 'postcss';
import { z } from 'zod';
import { CARD_PARTS, CART_PARTS, CATALOG_PARTS, COSMETIC_PARTS, sanitizeKitSurfaceCss, sanitizeProductThemeCss, type KitSurface } from './product-theme-css';
import { checkProductThemeOnSnapshot, type ThemeCheckFailure } from './product-theme-check';
import { checkKitSurfacesOnSnapshot, type KitSurfaceFailures } from './kit-surface-check';
import { captureSep5Draft } from './design-engine/sep5-review-capture';
import { currentSourceRuntime } from './source-runtime';
import { sourceResponseJson } from './source-response';
import { patchConfigFile, readConfigFile, sanitizeLook, type StoreLook } from './store-look';
import type { SourceProjectSnapshot } from './source-project';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

export const TOUCH_KEYS = { product: 'productCss', catalog: 'catalogCss', card: 'cardCss', cart: 'cartCss' } as const;
export type TouchSurface = keyof typeof TOUCH_KEYS;
export type KitTouchCss = Partial<Record<(typeof TOUCH_KEYS)[TouchSurface], string>>;
/** `used` charges the touch attempt: the caller calls it only when the CSS it keeps is non-empty (an agent theme may still
 * discard surfaces after the check), so discarded CSS is never billed. */
export type KitTouchResult = { css: KitTouchCss; notes: string[]; dropped: Array<{ surface: TouchSurface; reason: string }>; used: () => void };
export const KIT_TOUCH_TIMEOUT_MS = 60_000;
export const KIT_TOUCH_MAX_OUTPUT_TOKENS = 6_000;
const SURFACES: TouchSurface[] = ['product', 'catalog', 'card', 'cart'];
export const KIT_TOUCH_SCHEMA = { type: 'object', additionalProperties: false, required: ['product', 'catalog', 'card', 'cart', 'notes'],
  properties: { product: { type: 'string' }, catalog: { type: 'string' }, card: { type: 'string' }, cart: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } } } } as const;
const replySchema = z.object({ product: z.string(), catalog: z.string(), card: z.string(), cart: z.string(), notes: z.array(z.string()) });

const PLATFORM_CSS = new Set(['commerce-pages.css', 'brand.css']);
const DEVICE = /\b(transform|rotate|box-shadow|clip-path|filter|mask|mix-blend-mode|animation)\s*:/i;
/** The authored rules that carry a visual device (transforms, hard shadows, cut edges, filters, pseudo-element layers,
 * keyframes), from the store's own stylesheets only, trimmed to about 4 KB. */
export function distinctiveCss(files: ReadonlyArray<{ path: string; content: string }>, limit = 4000): string {
  const out: string[] = [];
  for (const file of files.filter(f => f.path.endsWith('.css') && !PLATFORM_CSS.has(f.path) && !f.path.startsWith('assets/'))) {
    let root: postcss.Root;
    try { root = postcss.parse(file.content); } catch { continue; }
    root.walk(node => {
      if (node.type === 'atrule' && /keyframes$/i.test(node.name)) out.push(node.toString());
      else if (node.type === 'rule' && node.parent?.type !== 'atrule' && (/::?(before|after)/.test(node.selector) || DEVICE.test(node.toString()))) out.push(node.toString());
    });
  }
  let text = '';
  for (const rule of out) { if (text.length + rule.length > limit) break; text += `${rule}\n`; }
  return text.trim();
}

export function kitTouchPrompt(input: { storeName: string; look?: StoreLook; signature?: unknown; distinctive: string; instruction?: string }): string {
  return [
    `You designed the home page of «${input.storeName}» (screenshots attached: the first screens at 1280px). The platform draws four more surfaces itself: the product page, the catalog pages, the product cards and the cart drawer. They already follow the home's measured look below. Carry the home page's OWN distinctive devices onto those surfaces with guarded CSS, so a shopper never feels they left the store. Never invent a new style: use only devices the home already shows (its shadows, frames, rotations, cut edges, stamps, rules, label style). Leave a surface empty when the measured look already carries it.`,
    `Measured look: ${JSON.stringify(input.look ?? {})}`,
    input.signature ? `The store's signature: ${JSON.stringify(input.signature)}` : '',
    `The home page's distinctive CSS (excerpt):\n${input.distinctive || '(none)'}`,
    input.instruction ? `The merchant asked now: «${input.instruction}». Apply it to these surfaces only.` : '',
    'Guarded CSS, for every surface:',
    '- Selectors are only [data-part="name"] compounds (at most 3 per selector) with :hover, :focus-visible, ::before or ::after. No tags, classes or ids. The platform adds the scope.',
    '- Allowed: literal colours or var(--store-*), var(--brand-*), var(--kit-*) (and var(--pd-*) on the product page); borders, border-radius, box-shadow, outline, backgrounds (colours and gradients), filter (grayscale/sepia 0-1, saturate 0-2, contrast/brightness 0.5-1.5, hue-rotate up to 45deg), transform, clip-path (not on buttons), aspect-ratio, object-fit, letter-spacing, text-transform, font-style, @keyframes. No url(), no !important, no custom properties, no position:fixed.',
    '- At most 40 rules and 3000 characters per surface.',
    `- product parts: ${COSMETIC_PARTS.join(', ')}. Price, options, quantity, the buy button, the seal and the trust row are protected.`,
    `- catalog parts: ${CATALOG_PARTS.join(', ')}. On the container part grid: no animation*, transform, filter, mix-blend-mode, overflow, color or font-size, and nothing that hides or sizes it.`,
    `- card parts: ${CARD_PARTS.join(', ')}. The price and the add-to-cart button are protected. On the container part card: no animation*, transform, filter, mix-blend-mode, overflow, color or font-size, and nothing that hides or sizes them (style their children instead). No card part is ever positioned or given a z-index (the card's details link covers it).`,
    `- cart parts: ${CART_PARTS.join(', ')}. Quantities, totals, remove and the checkout button are protected. The same container restrictions apply to the part cart-line.`,
    'On catalog, card and cart, ::before/::after are never positioned (no position, inset, top/left/right/bottom, z-index).',
    "A real browser checks every surface at 390px and 1280px: anything that hides, covers, shrinks or fades a protected control, or makes a page scroll sideways, drops that surface's CSS.",
    'Answer with JSON: product, catalog, card and cart (each CSS text, empty when nothing is needed) and notes (one short line in Spanish per surface you changed, for the merchant).',
  ].filter(Boolean).join('\n\n');
}

type ModelImage = { type: 'input_image'; image_url: string; detail: 'auto' };
export type KitTouchDeps = {
  files: SourceProjectFileDto[]; brief: unknown; storeName: string; signature?: unknown; instruction?: string; signal: AbortSignal;
  call: (text: string, images: ModelImage[]) => Promise<{ body: unknown; used: () => void }>;
  capture?: (snapshot: SourceProjectSnapshot, signal: AbortSignal) => Promise<ModelImage[]>;
  checkProduct?: (snapshot: SourceProjectSnapshot, options: { signal?: AbortSignal }) => Promise<ThemeCheckFailure[]>;
  checkSurfaces?: (snapshot: SourceProjectSnapshot, options: { signal?: AbortSignal }) => Promise<KitSurfaceFailures>;
};

/** The home page's first screens at 1280px, from the review's own capture helper. */
export async function captureHomeForTouch(snapshot: SourceProjectSnapshot, signal: AbortSignal): Promise<ModelImage[]> {
  const { shots } = await captureSep5Draft(await currentSourceRuntime(snapshot), signal);
  return shots.filter(shot => shot.width === 1280).slice(0, 2).map(shot => ({ type: 'input_image', image_url: shot.image, detail: 'auto' }));
}

export async function runKitTouch(deps: KitTouchDeps): Promise<KitTouchResult | null> {
  const snapshot = { brief: deps.brief, files: deps.files } as unknown as SourceProjectSnapshot;
  const config = readConfigFile(deps.files);
  const images = await (deps.capture ?? captureHomeForTouch)(snapshot, deps.signal);
  const { body, used } = await deps.call(kitTouchPrompt({ storeName: deps.storeName, look: sanitizeLook(config.look), signature: deps.signature, distinctive: distinctiveCss(deps.files), instruction: deps.instruction }), images);
  let raw: unknown;
  try { raw = sourceResponseJson(body); } catch { return null; }
  const parsed = replySchema.safeParse(raw);
  if (!parsed.success) return null;
  const css: KitTouchCss = {};
  const dropped: KitTouchResult['dropped'] = [];
  for (const surface of SURFACES) {
    const text = parsed.data[surface];
    if (!text.trim()) continue;
    const report = surface === 'product' ? sanitizeProductThemeCss(text) : sanitizeKitSurfaceCss(surface as KitSurface, text);
    for (const item of report.dropped) dropped.push({ surface, reason: `${item.rule ?? item.declaration ?? ''} ${item.reason}`.trim() });
    if (report.css) css[TOUCH_KEYS[surface]] = report.css;
  }
  if (Object.keys(css).length) {
    const candidate = { ...snapshot, files: patchConfigFile(deps.files, current => ({ ...current, dna: { version: 1, ...(current.dna ?? {}), ...css } })) } as SourceProjectSnapshot;
    if (css.productCss) {
      const failures = await (deps.checkProduct ?? checkProductThemeOnSnapshot)(candidate, { signal: deps.signal });
      if (failures.length) { delete css.productCss; dropped.push(...failures.map(f => ({ surface: 'product' as const, reason: `${f.control} (${f.viewport}): ${f.reason}` }))); }
    }
    if (css.catalogCss || css.cardCss || css.cartCss) {
      const failures = await (deps.checkSurfaces ?? checkKitSurfacesOnSnapshot)(candidate, { signal: deps.signal });
      for (const surface of ['catalog', 'card', 'cart'] as const) if (css[TOUCH_KEYS[surface]] && failures[surface].length) {
        delete css[TOUCH_KEYS[surface]];
        dropped.push(...failures[surface].map(f => ({ surface, reason: `${f.control} (${f.viewport}): ${f.reason}` })));
      }
    }
  }
  return { css, notes: parsed.data.notes.slice(0, 4).map(note => note.slice(0, 200)), dropped, used };
}

/** The touch a store's previous save carried (marked dna.touch = 1): kept on an ordinary edit, never on a new store or a
 * redesign, whose design is new. The concept's DNA re-seeds productCss on every save, so KEPT_DNA alone would lose it. */
export function carriedTouch(previousDna: unknown, creative: boolean): Record<string, string | number> {
  if (creative || !previousDna || typeof previousDna !== 'object' || (previousDna as Record<string, unknown>).touch !== 1) return {};
  const dna = previousDna as Record<string, unknown>;
  const out: Record<string, string | number> = { touch: 1 };
  for (const key of Object.values(TOUCH_KEYS)) if (typeof dna[key] === 'string' && dna[key]) out[key] = dna[key] as string;
  return out;
}

export const MERCHANT_MARKER = 'Pedido actual del comercio:';
/** The merchant's own words (after MERCHANT_MARKER), accents removed and lower-cased: what the request classifiers read. */
export function merchantOwnWords(text: string): string {
  return (text.split(MERCHANT_MARKER).at(-1) ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
/** Phrases about the header cart itself (spec 2026-10-14 store controls): its icon, button, symbol or count badge, and its look,
 *  «carrito como / en forma de / con un ícono de …» plus up to four words, never past a conjunction or a second «carrito». One
 *  source for both classifiers: the kit touch strips them (the cart page is not meant) and the controls request reads them. */
const HEADER_CART = String.raw`\b(?:icono|boton|simbolo|logo|dibujo)(?:es|s)?\s+(?:del?\s+|de\s+la\s+)?carrito\b|\b(?:contador|numerito|burbuja|insignia)\s+del?\s+carrito\b|\bcarrito\s+(?:como|en\s+forma\s+de|con\s+forma\s+de|con\s+(?:un|una|el|la|otro|otra)\s+(?:icono|simbolo|dibujo))\b(?:\s+(?!(?:carrito|y|e|o|u|ni|pero|que)\b)[a-z]+){0,4}`;
/** Does the merchant's own wording (merchantOwnWords) name the header cart's look, drawing or badge? */
export function namesHeaderCart(own: string): boolean {
  return new RegExp(HEADER_CART).test(own);
}
/** The merchant's own words without the phrases about the header cart (its look, badge, drawing or header placement). */
export function withoutHeaderCart(own: string): string {
  return own.replace(new RegExp(HEADER_CART, 'g'), ' ').replace(/\bcarrito\s+(?:del?\s+|de\s+la\s+|en\s+(?:el|la)\s+)?(?:encabezado|header|menu|barra|navegacion|cabecera)\b/g, ' ');
}
/** Does the merchant's own request concern the kit pages (product page, catalog, cards, cart)? Only their words count. */
export function instructionConcernsKitSurfaces(text: string): boolean {
  const own = merchantOwnWords(text);
  // The cart's icon, button, badge, look («carrito como una taza») or header placement is the header's business, not the cart
  // page's: the first are a controls request (store-controls-design.ts), the placement the header's.
  const cart = own.replace(new RegExp(HEADER_CART, 'g'), ' ').replace(/\bcarrito\s+(?:del?\s+|de\s+la\s+|en\s+(?:el|la)\s+)?(?:encabezado|header|menu|barra|navegacion|cabecera)\b/g, ' ');
  return /\bcarrito\b/.test(cart) || /\bcatalogo\b|\bfotos?\s+de\s+(?:los\s+)?productos?\b|\btarjetas?\s+de(?:l)?\s+productos?\b|\bpagina\s+de(?:l)?\s+productos?\b|\bficha\b|\bproduct\s+(?:page|card)s?\b/.test(own);
}

/** The touch fields of a dna object (the surfaces the store already had touched), empty ones left out. */
export function pickTouch(dna: unknown): KitTouchCss {
  const source = dna && typeof dna === 'object' ? dna as Record<string, unknown> : {};
  return Object.fromEntries(Object.values(TOUCH_KEYS).filter(key => typeof source[key] === 'string' && source[key]).map(key => [key, source[key] as string]));
}

/** How long a touch may take (spec 2026-10-14): up to 150 s, always leaving `marginMs` of the run for saving (60 s in chat,
 * 90 s in the review stage); 0 (skip it) when less than 60 s would be left to it. */
export function touchBudgetMs(remainingMs: number, marginMs = 60_000): number {
  const budget = Math.min(150_000, remainingMs - marginMs);
  return budget >= 60_000 ? budget : 0;
}

/** The chat re-run's touch once the agent's own theme of the same request is applied: the agent wins on every kit surface it
 * set, and on the product page whenever it set a theme (T8-I5). `bill` is true only when CSS is left to save. */
export function chatTouchKept(css: KitTouchCss, agentTheme: Partial<Record<'catalogCss' | 'cardCss' | 'cartCss', unknown>> | null | undefined): { css: KitTouchCss; bill: boolean } {
  const kept = { ...css };
  if (agentTheme) {
    delete kept.productCss;
    for (const key of ['catalogCss', 'cardCss', 'cartCss'] as const) if (agentTheme[key]) delete kept[key];
  }
  return { css: kept, bill: Object.keys(kept).length > 0 };
}
