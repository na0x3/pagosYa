/**
 * YAPI designs the store's controls (spec 2026-10-14, part 4): one dedicated call that returns the controls record as strict JSON
 * plus one short Spanish note. It runs beside the background review call (revision N+1) and again on a chat request about the
 * controls. The answer is sanitized here; the caller checks it in a browser (store-controls-guard.ts). A timeout, an unusable
 * answer or a failing guard keeps the store's library language: this never fails a build.
 */
import { PLAYBOOK, type PlaybookKind } from './design-engine/playbook';
import { sourceResponseJson } from './source-response';
import { merchantOwnWords, namesHeaderCart } from './kit-touch';
import { captureControlsShots, CONTROLS_GUARD_TIMEOUT_MS, type ModelImage } from './store-controls-guard';
import { ACCOUNT_LAYOUTS, CART_LAYOUTS, CONTROL_BADGES, CONTROL_BORDERS, CONTROL_COLOURS, CONTROL_FILLS, CONTROL_OUTLINES, ICON_SLOTS, cleanControlWord, sanitizeControlsReport, type IconSlot, type StoreControls } from './store-controls';
import { languageReadable, pickLibraryControls, storePalette } from './store-controls-library';
import { readConfigFile, sanitizeLook, type StoreLook } from './store-look';
import type { SourceProjectSnapshot } from './source-project';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

export const CONTROLS_TIMEOUT_MS = 60_000;
export const CONTROLS_MAX_OUTPUT_TOKENS = 4_000;
/** The controls call's own deadline (spec: about 60 s, like the kit touch); a function so a test can shorten it. */
export function controlsDeadlineMs(): number { return CONTROLS_TIMEOUT_MS; }
/** A chat request's controls call (review CD fix 2): its own deadline, but always leaving the browser guard's own time
 *  (CONTROLS_GUARD_TIMEOUT_MS) and 60 s of the run for saving; 0 (skip it) when less than 20 s would be left to the call. */
export function controlsRequestBudgetMs(remainingMs: number): number {
  const budget = Math.min(controlsDeadlineMs(), remainingMs - 60_000 - CONTROLS_GUARD_TIMEOUT_MS);
  return budget >= 20_000 ? budget : 0;
}
/** The review stage's guard on YAPI's record (review CD fix 5): the time left before the stage's deadline minus 60 s for the header
 *  check and the N+1 save; 0 (skip the guard and keep revision N's language) when the guard's own time would not fit. */
export function reviewControlsGuardBudgetMs(remainingMs: number): number {
  const budget = remainingMs - 60_000;
  return budget >= CONTROLS_GUARD_TIMEOUT_MS ? budget : 0;
}
/** The edit's chat reply when a request about the controls kept the store's language (review CD fix 4). */
export const CONTROLS_REQUEST_DROPPED_NOTE = 'No pude cambiar los botones esta vez; el resto de tu pedido quedó guardado.';

export const CONTROLS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['shape', 'layout', 'icons', 'words', 'badge', 'note'],
  properties: {
    shape: { type: 'object', additionalProperties: false, required: ['outline', 'corner', 'notch', 'tilt', 'border', 'weight', 'fill', 'colour'], properties: {
      outline: { type: 'string', enum: [...CONTROL_OUTLINES] }, corner: { type: 'number' }, notch: { type: 'number' }, tilt: { type: 'number' },
      border: { type: 'string', enum: [...CONTROL_BORDERS] }, weight: { type: 'number' }, fill: { type: 'string', enum: [...CONTROL_FILLS] }, colour: { type: 'string', enum: [...CONTROL_COLOURS] },
    } },
    layout: { type: 'object', additionalProperties: false, required: ['cart', 'account'], properties: { cart: { type: 'string', enum: [...CART_LAYOUTS] }, account: { type: 'string', enum: [...ACCOUNT_LAYOUTS] } } },
    icons: { type: 'object', additionalProperties: false, required: [...ICON_SLOTS], properties: Object.fromEntries(ICON_SLOTS.map(slot => [slot, { type: 'string' }])) },
    words: { type: 'object', additionalProperties: false, required: ['cart', 'account'], properties: { cart: { type: 'string' }, account: { type: 'string' } } },
    badge: { type: 'string', enum: [...CONTROL_BADGES] },
    note: { type: 'string' },
  },
};

/** The store's colour tokens as the model should read them (brand.css first, then styles.css), at most 16. */
export function storeTokens(files: ReadonlyArray<{ path: string; content: string }>): string {
  const found = new Map<string, string>();
  for (const path of ['brand.css', 'styles.css']) {
    const css = files.find(file => file.path === path)?.content ?? '';
    for (const match of css.matchAll(/--(?:store|brand)-([\w-]+)\s*:\s*([^;{}]+)/g)) if (!found.has(match[1])) found.set(match[1], match[2].trim().slice(0, 60));
  }
  return [...found].slice(0, 16).map(([name, value]) => `${name}: ${value}`).join('; ');
}

const languageOf = (controls: StoreControls) => ({ outline: controls.shape.outline, fill: controls.shape.fill, colour: controls.shape.colour, badge: controls.badge, cart: controls.icons.cart ?? '' });
export type ControlsPromptInput = { storeName: string; kind: PlaybookKind; brief: unknown; products: string[]; tokens: string; look?: StoreLook; avoid: StoreControls[]; previous?: StoreControls; current?: StoreControls; instruction?: string; cartWord?: string };
export function controlsPrompt(input: ControlsPromptInput): string {
  const { version: _version, source: _source, ...example } = pickLibraryControls({ kind: input.kind, mode: 'calm', seed: 'example' });
  return [
    `Design the small controls of «${input.storeName}», a ${PLAYBOOK[input.kind].name} business: the header's cart, account, menu and search buttons, the product cards' "+" button, the quantity steppers, the cart's close button and the count badge. Screenshots attached: the home page with its header at 1440px and 390px. The shape must belong to this store's look and the icons and words to what it sells, so no two stores look alike.`,
    `Business: ${JSON.stringify({ brief: input.brief, products: input.products })}`,
    `Colour tokens (the controls use only these, through colour: accent, ink or paper): ${input.tokens || '(not found)'}`,
    `Measured look of the home page: ${JSON.stringify(input.look ?? {})}`,
    input.avoid.length ? `Other stores already use these control languages; do not repeat an outline together with a similar cart icon: ${JSON.stringify(input.avoid.map(languageOf))}` : '',
    input.previous ? `This is a redesign: move away from the store's previous controls: ${JSON.stringify(languageOf(input.previous))}` : '',
    input.current ? `The store's current controls (change them as the merchant asks; keep what they did not mention): ${JSON.stringify(languageOf(input.current))}` : '',
    input.instruction ? `The merchant asked now: «${input.instruction}». Follow it for the controls.` : '',
    // A chat request names its own words; the sheet's order word applies only to YAPI's own designs (final review 2026-10-15).
    input.cartWord && !input.instruction ? `This store calls an order «${input.cartWord}» (its voice sheet): that is the cart word.` : '',
    'Rules:',
    '- shape: outline is one of the listed outlines; corner 0-24 px; notch 0-10 px (ticket notches, tag cut, stamp scallop depth); tilt -6 to 6 degrees (drawn on the face, never the tap target); weight 1-3 px. fill: solid, outline, ghost (no fill, the header text colour) or inverted. colour: accent, ink or paper.',
    '- icons: SVG path data only (the d attribute) for a 24x24 box, every point between 0 and 24, at most 1,500 characters each. They are FILLED with the text colour using fill-rule evenodd, so a line icon must be drawn as its outline (an outer shape and an inner shape). No other SVG elements, attributes, URLs or text. The cart icon shows what this store sells (a cup, a bag, a basket, a frame, a scoop, a briefcase, a leaf, a paw, or anything that fits it better); the others are account, menu, search, plus, minus and close. An empty string keeps the platform icon.',
    '- words: cart and account in Spanish, 1-14 letters, no emoji. An empty string keeps the platform word. Screen readers keep their own plain labels.',
    '- layout: cart icon+word, icon or word; account icon, word or icon+word. badge: dot, circle, inline, corner or stamp.',
    '- A real browser checks every control at 1440px and 390px: 44px tap targets, nothing covered, no sideways scroll, words at 4.5:1 and icons and borders at 3:1 contrast against the header. A failing icon is replaced by the platform icon; any other failure discards the whole design.',
    `A valid answer looks like this (do not copy it): ${JSON.stringify({ ...example, note: 'Diseñé los botones como boletos, con una taza para el carrito.' })}`,
    'Answer with JSON: shape, layout, icons, words, badge, and note (one short sentence in Spanish for the merchant saying what you designed).',
  ].filter(Boolean).join('\n\n');
}

export type ControlsDesignDeps = {
  files: SourceProjectFileDto[]; brief: unknown; storeName: string; kind: PlaybookKind; products: string[]; avoid: StoreControls[];
  previous?: StoreControls; current?: StoreControls; instruction?: string; cartWord?: string; signal: AbortSignal;
  call: (text: string, images: ModelImage[]) => Promise<{ body: unknown; used: () => void }>;
  fallbackIcon: (slot: IconSlot) => string | undefined;
  capture?: (snapshot: SourceProjectSnapshot, signal: AbortSignal) => Promise<ModelImage[]>;
  /** Why an answer was dropped before the guard: not usable, or unreadable on the store's tokens. */
  onDropped?: (reason: ControlsDropReason) => void;
};
export type ControlsDropReason = 'unusable answer' | 'contrast';
export type ControlsDesign = { controls: StoreControls; note: string; used: () => void; replacedIcons: IconSlot[] };
/** One controls call. Null for an unusable answer (not JSON, an unknown enum, a missing number) and for a record the store
 *  cannot read on its own hex tokens, the same filter the library's languages pass (review CD fix 3: the guard measures one
 *  colour and misses translucent or gradient headers); `used` bills the attempt and is called by the caller only when the
 *  guard keeps the record. */
export async function runControlsDesign(deps: ControlsDesignDeps): Promise<ControlsDesign | null> {
  const snapshot = { brief: deps.brief, files: deps.files } as unknown as SourceProjectSnapshot;
  const images = await (deps.capture ?? captureControlsShots)(snapshot, deps.signal);
  const text = controlsPrompt({ storeName: deps.storeName, kind: deps.kind, brief: deps.brief, products: deps.products, tokens: storeTokens(deps.files), look: sanitizeLook(readConfigFile(deps.files).look), avoid: deps.avoid, previous: deps.previous, current: deps.current, instruction: deps.instruction, cartWord: deps.cartWord });
  const { body, used } = await deps.call(text, images);
  let raw: unknown;
  const drop = (reason: ControlsDropReason) => { deps.onDropped?.(reason); return null; };
  try { raw = sourceResponseJson(body); } catch { return drop('unusable answer'); }
  if (!raw || typeof raw !== 'object') return drop('unusable answer');
  const answer = raw as Record<string, unknown>;
  const report = sanitizeControlsReport({ ...answer, version: 1, source: 'yapi' }, { fallbackIcon: deps.fallbackIcon });
  if (!report.controls) return drop('unusable answer');
  if (!languageReadable(report.controls, storePalette(deps.files))) return drop('contrast');
  const note = typeof answer.note === 'string' && answer.note.trim() ? answer.note.trim().slice(0, 200) : 'Diseñé los botones de tu tienda.';
  // Spec 2026-10-14 store voice: the sheet's order word is the cart word whenever it fits a control word.
  const cart = deps.instruction ? undefined : cleanControlWord(deps.cartWord);
  const controls = cart ? { ...report.controls, words: { ...report.controls.words, cart } } : report.controls;
  return { controls, note, used, replacedIcons: report.replacedIcons };
}

/** The header's other controls by name: the icon or button of the menu, the search or the account («el ícono de mi cuenta»,
 *  never «mi cuenta de Instagram»), and the search's magnifier. */
const HEADER_CONTROL = /\b(?:icono|boton|simbolo|dibujo)(?:es|s)?\s+(?:del?|de\s+la|de\s+mi|para\s+(?:el|la|mi))\s+(?:menu|buscador|busqueda|buscar|cuenta\b(?!\s+de\b))|\blupa\b/;
/** The store's controls as a group: «los botones de la tienda / del encabezado / de arriba». */
const HEADER_GROUP = /\b(?:botones|iconos)\s+(?:de\s+(?:la\s+)?(?:tienda|cabecera|barra|arriba)|del\s+(?:encabezado|header|menu\s+superior))\b/;
/** Bare «botones» / «íconos» (not «botones de …») with a shape word: the store's buttons, only when nothing else is named. */
const BARE_BUTTONS = /\b(?:botones|iconos)\b(?!\s+(?:de|del|para)\b)/;
const SHAPE_WORD = /\b(?:redond\w*|cuadrad\w*|esquinas?|bordes?|forma|pildoras?|boletos?|tickets?|etiquetas?|sellos?|stickers?|pegatinas?)\b/;
/** Another target named in the request: a page, section, social network or a named button of the authored pages. */
const OTHER_TARGET = /\b(?:portada|inicio|home|hero|banner|whatsapp|instagram|tiktok|facebook|redes|pie\s+de\s+pagina|footer|secci\w*|catalogo|productos?|ficha|comprar|reserv\w*|formulario|contacto|beneficios|testimonios|galeria|blog|paginas?|tarjetas?|pago|checkout|newsletter)\b/;
/** Does the merchant's own request concern the store's header controls (spec 2026-10-14; review CD fix 1)? Only their words count
 *  (after MERCHANT_MARKER), accents ignored. The request must name a header control as its target:
 *  - the cart's look, icon, button or count badge (namesHeaderCart, shared with the kit-touch classifier);
 *  - the icon or button of the menu, the search or the account, or the magnifier;
 *  - the controls as a group («los botones de la tienda / del encabezado / de arriba»);
 *  - bare «botones» / «íconos» with a shape word («botones más redondos»), only when the request names no other target
 *    (portada, inicio, WhatsApp, redes, pie de página, sección, catálogo, producto, «Comprar ahora», «reservar»…).
 *  A shape word alone, «Cambia el carrito» (the cart page's) or a button of the authored pages is never a controls request. */
export function instructionConcernsControls(text: string): boolean {
  const own = merchantOwnWords(text);
  if (namesHeaderCart(own) || HEADER_CONTROL.test(own) || HEADER_GROUP.test(own)) return true;
  return BARE_BUTTONS.test(own) && SHAPE_WORD.test(own) && !OTHER_TARGET.test(own);
}
