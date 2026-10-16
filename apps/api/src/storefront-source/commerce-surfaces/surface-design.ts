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

export function surfacesPrompt(input: SurfacesPromptInput): string {
  return [
    `You design the shopping parts of the store «${input.storeName}» (kind: ${input.kind}) as kit templates, in the store's own visual language: the colours, fonts, button shape and motion of its home page in the screenshots. Make them distinctive, never a generic e-commerce look.`,
    'Rules: the platform fills every slot (names, prices, totals, stock, options, quantity steppers, buy and pay buttons, the payment box). Leave every slot element EMPTY. You own layout, typography and decoration around the slots. You never type a price, total, discount, stock count, review or guarantee; no <script>, no on* attributes, no javascript: links, no @import or external url() in CSS. Use var(--store-*) and var(--brand-*) tokens; every CSS selector uses one of your template\'s own classes (never body, html, tags alone or the platform\'s classes); no «<» and no digits in CSS content. Put the photo and image slots on an <img>; no <form>, <input>, <iframe> or <style> inside the template, no external image URLs. Keep each template under 14,000 characters and its CSS under 8,000. Nothing may scroll sideways at 390px; text never overlaps text; keep contrast readable.',
    input.cartWord ? `The cart is called «${input.cartWord}»: use that word in headings and the added notice.` : '',
    `Store tokens: ${input.tokens || 'none'}`,
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
