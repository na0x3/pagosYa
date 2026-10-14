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
export type KitTouchResult = { css: KitTouchCss; notes: string[]; dropped: Array<{ surface: TouchSurface; reason: string }> };
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
    `- catalog parts: ${CATALOG_PARTS.join(', ')}.`,
    `- card parts: ${CARD_PARTS.join(', ')}. The price and the add-to-cart button are protected. On the container parts card, cart-line and grid: no animation*, transform, filter, mix-blend-mode, overflow, color or font-size, and nothing that hides or sizes them (style their children instead).`,
    `- cart parts: ${CART_PARTS.join(', ')}. Quantities, totals, remove and the checkout button are protected. The same container restrictions apply to cart-line.`,
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
  if (Object.keys(css).length) used();
  return { css, notes: parsed.data.notes.slice(0, 4).map(note => note.slice(0, 200)), dropped };
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
