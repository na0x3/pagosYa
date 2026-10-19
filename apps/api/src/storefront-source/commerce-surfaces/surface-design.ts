import { sourceResponseJson } from '../source-response';
import type { SourceInputImage } from '../source-generation-types';
import { SURFACE_CONTRACT, SURFACE_LABELS, SURFACE_PARTS, type SurfacePart, type SurfaceTemplate } from './surface-parts';
import type { SurfaceFailure } from './surface-checks';

/** Spec 2026-10-15 free commerce surfaces: one structured call that writes the requested parts as kit templates. */
export const SURFACES_TIMEOUT_MS = 150_000;
export const SURFACES_MAX_OUTPUT_TOKENS = 16_000;
export const SURFACES_SCHEMA = { type: 'object', additionalProperties: false, required: ['parts', 'note'], properties: {
  note: { type: 'string' },
  parts: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['part', 'html', 'css'], properties: {
    part: { type: 'string', enum: [...SURFACE_PARTS] }, html: { type: 'string' }, css: { type: 'string' } } } },
} } as const;
export type SurfacesCall = (text: string, images: SourceInputImage[]) => Promise<{ body: unknown; used: () => void }>;
export type SurfacesPromptInput = { storeName: string; kind: string; cartWord?: string; tokens: string; dna: Record<string, unknown>; parts: SurfacePart[]; keep?: SurfaceTemplate[]; repair?: { previous: SurfaceTemplate[]; failures: SurfaceFailure[] }; instruction?: string };

const contract = (part: SurfacePart) => {
  const c = SURFACE_CONTRACT[part];
  return `- ${part} (${SURFACE_LABELS[part]}): one <template ${c.attr}> with ONE root element. Required ${c.slotAttr}: ${c.required.map(s => `"${s}"`).join(', ')}; optional: ${c.optional.map(s => `"${s}"`).join(', ') || 'none'}${c.controls.length ? `; required controls: ${c.controls.map(x => `<${x.tag} ${x.attr}>`).join(', ')}` : ''}.`;
};
const asSource = (templates: SurfaceTemplate[]) => templates.map(t => `${t.html}\n<style>${t.css}</style>`).join('\n');

/** The premium anatomy of the owner's Amboras references (2026-10-19): one proven high-end structure, themed per store. */
export const PREMIUM_PRODUCT_PAGE = 'Product page, premium atelier anatomy (the structure of the best independent stores; theme it, do not reinvent it): the photo column (gallery slot large, thumbnails below it) beside the purchase column, which runs in this order: breadcrumb slot small, rating slot, an eyebrow you write in tracked small caps on a short hairline ornament carrying one real fact from the brief (where or how the product is made, never an invented one), the title slot large in the display font with tight tracking (-0.02em), one italic subtitle line you write from the brief, the pricing slot over a 1px rule, the description or highlights, the buy slot, the delivery or info slot, then a row of three small trust items. Generous whitespace, 1px rules, no boxes around every block.';
export const PREMIUM_CARD = 'Product card, premium anatomy: the photo in a clean panel (white or the store surface) with the product centred and nothing on it but an optional badge, the name below in the display font or tracked caps, the price small under it, and the add control full width in tracked uppercase with a small bag icon. On hover only the photo moves (scale 1.03 over 0.5s). No drop-shadow stacks, no blobs, no tilted cards.';
export const PREMIUM_TYPE_AND_MOTION = 'Type and motion: labels, eyebrows and every button in tiny tracked uppercase (11–13px, letter-spacing 0.15–0.3em, weight 600–800) with generous padding; one button shape for the store (square or pill, as its DNA says); titles large and tight; hover transitions 0.15–0.2s cubic-bezier(0.4,0,0.2,1) and nothing else moving: no bounce, wobble, spin or looping animation.';

export function surfacesPrompt(input: SurfacesPromptInput): string {
  return [
    `You design the shopping parts of the store «${input.storeName}» (kind: ${input.kind}) as kit templates, in the store's own visual language: the colours, fonts, button shape and motion of its home page in the screenshots. Make them distinctive, never a generic e-commerce look.`,
    'Rules: the platform fills every slot (names, prices, totals, stock, options, quantity steppers, buy and pay buttons, the payment box). Leave every slot element EMPTY. The controls are not slots: you write their words, short and in the store\'s voice (or an <svg> icon with an aria-label) — the card\'s data-product-add button and data-product-link, the cart\'s data-cart-close button and the added notice\'s data-cart-open button. Never leave a control empty: it shows as a blank button. You own layout, typography and decoration around the slots. You never type a price, total, discount, stock count, review or guarantee; no <script>, no on* attributes, no javascript: links, no @import or external url() in CSS. Use only the var() tokens listed under Store tokens (or define your own custom properties on your template\'s root class); for spacing, sizes, radii and grid tracks write real CSS values with units (px, rem, %, fr, e.g. gap:16px, minmax(280px,1fr)), never words like thin or small; every CSS selector uses one of your template\'s own classes (never body, html, tags alone or the platform\'s classes); no «<» in CSS and never a digit inside a CSS content: property (prices and numbers come from the slots). The product page template is the whole page: give its root a max-width and side padding so no text touches the screen edge, and keep title, price and buy button in the first screen on desktop. Put the photo and image slots on an <img>; no <form>, <input>, <iframe> or <style> inside the template, no external image URLs. Keep each template under 14,000 characters and its CSS under 8,000. Nothing may scroll sideways at 390px; text never overlaps text; keep contrast readable.',
    input.parts.includes('cart') ? 'The cart template fills a side panel at the right, half the screen wide (420–760px; the whole width on a phone), and its continue button leads to the order review and then payment: stack the lines, totals and action in ONE column, never a two-column page with a side summary.' : '',
    input.cartWord ? `The cart is called «${input.cartWord}»: use that word in headings and the added notice.` : '',
    input.parts.includes('productPage') ? PREMIUM_PRODUCT_PAGE : '',
    input.parts.includes('card') ? PREMIUM_CARD : '',
    input.parts.some(part => part === 'productPage' || part === 'card') ? PREMIUM_TYPE_AND_MOTION : '',
    `Store tokens, the custom properties the store defines (write them exactly as named, e.g. var(--store-accent); no other variable exists): ${input.tokens || 'none'}`,
    `Store DNA (keep consistent): ${JSON.stringify(input.dna).slice(0, 1500)}`,
    'Parts to design now:', ...input.parts.map(contract),
    input.keep?.length ? `Already approved (do not return): ${input.keep.map(t => t.part).join(', ')}. Match their look:\n${asSource(input.keep).slice(0, 12_000)}` : '',
    input.repair ? `Repair: these checks failed in a real browser purchase. Fix exactly these and keep the rest of each design:\n${input.repair.failures.map(f => `- ${f.part} · ${f.check}: ${f.detail}`).join('\n')}\nPrevious versions:\n${asSource(input.repair.previous).slice(0, 16_000)}` : '',
    input.instruction ? `The merchant asked: «${input.instruction.slice(0, 600)}»` : '',
    'Answer JSON: parts (one entry per part to design now: part, html with the single <template>, css) and note (one short Spanish sentence for the merchant).',
  ].filter(Boolean).join('\n\n');
}

export function parseSurfacesAnswer(body: unknown, parts: SurfacePart[]): SurfaceTemplate[] | null {
  let raw: any;
  try { raw = sourceResponseJson(body); } catch { return null; }
  if (!raw || !Array.isArray(raw.parts)) return null;
  return raw.parts.filter((p: any) => p && parts.includes(p.part) && typeof p.html === 'string' && typeof p.css === 'string')
    .map((p: any) => ({ part: p.part as SurfacePart, html: p.html.slice(0, 20_000), css: p.css.slice(0, 12_000) }));
}
