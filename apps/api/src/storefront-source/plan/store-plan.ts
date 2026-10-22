/** YAPI plan card (spec 2026-10-22): what a store will be, line by line with its reason, before anything is built. */
export type PlanChoice = { id: string; why: string };
export type PlanCustomSection = { kind: 'per-brand' | 'per-category' | 'facts' | 'origin' | 'guide'; why: string; items: { name: string; layout: string; colourFrom?: string }[] };
export type StorePlan = {
  version: 1; parts: Record<string, PlanChoice>; sections: PlanChoice[]; custom: PlanCustomSection[];
  colour: { palette: string; accent?: string; from: string }; fonts: PlanChoice; motif?: { what: string; from: string };
  brands: string[]; card: string[]; revision: number;
};
export type PlanCatalogue = { variants: Record<string, readonly string[]>; sections: readonly string[]; palettes: readonly string[]; fonts: readonly string[] };

const CUSTOM_KINDS = ['per-brand', 'per-category', 'facts', 'origin', 'guide'] as const;
const LAYOUTS = ['stats', 'numbered', 'polaroid', 'split', 'marquee', 'chips', 'quote', 'float'] as const;
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const record = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
const list = (value: unknown) => Array.isArray(value) ? value : [];
const HEX = /^#[0-9a-f]{6}$/i;

const choice = (ids: readonly string[]) => ({ type: 'object', additionalProperties: false, required: ['id', 'why'],
  properties: { id: { type: 'string', enum: [...ids] }, why: { type: 'string' } } });

/** Strict schema: every enum is the live Esencial catalogue, so the model cannot name a part that does not exist. */
export function planJsonSchema(c: PlanCatalogue): object {
  const parts = Object.fromEntries(Object.entries(c.variants).map(([part, ids]) => [part, { anyOf: [choice(ids), { type: 'null' }] }]));
  return { type: 'object', additionalProperties: false,
    required: ['parts', 'sections', 'custom', 'colour', 'fonts', 'motif', 'brands', 'card'],
    properties: {
      parts: { type: 'object', additionalProperties: false, required: Object.keys(c.variants), properties: parts },
      sections: { type: 'array', maxItems: 4, items: choice(c.sections) },
      custom: { type: 'array', maxItems: 2, items: { type: 'object', additionalProperties: false, required: ['kind', 'why', 'items'], properties: {
        kind: { type: 'string', enum: [...CUSTOM_KINDS] }, why: { type: 'string' },
        items: { type: 'array', maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['name', 'layout', 'colourFrom'], properties: {
          name: { type: 'string' }, layout: { type: 'string', enum: [...LAYOUTS] }, colourFrom: { type: ['string', 'null'] } } } } } } },
      colour: { type: 'object', additionalProperties: false, required: ['palette', 'accent', 'from'], properties: {
        palette: { type: 'string', enum: [...c.palettes] }, accent: { type: ['string', 'null'] }, from: { type: 'string' } } },
      fonts: choice(c.fonts),
      motif: { anyOf: [{ type: 'object', additionalProperties: false, required: ['what', 'from'], properties: { what: { type: 'string' }, from: { type: 'string' } } }, { type: 'null' }] },
      brands: { type: 'array', maxItems: 12, items: { type: 'string' } },
      card: { type: 'array', maxItems: 7, items: { type: 'string' } },
    } };
}

/** The model's answer as a plan: unknown ids dropped, duplicates collapsed, lists capped. Never throws. */
export function normalizePlan(raw: unknown, c: PlanCatalogue, revision: number): StorePlan {
  const input = record(raw);
  const parts: Record<string, PlanChoice> = {};
  for (const [part, value] of Object.entries(record(input.parts))) {
    const id = text(record(value).id, 40);
    if (c.variants[part]?.includes(id)) parts[part] = { id, why: text(record(value).why, 200) };
  }
  const seen = new Set<string>();
  const sections = list(input.sections).map(record).map(s => ({ id: text(s.id, 40), why: text(s.why, 200) }))
    .filter(s => c.sections.includes(s.id) && !seen.has(s.id) && Boolean(seen.add(s.id))).slice(0, 4);
  const custom = list(input.custom).map(record).flatMap(s => {
    const kind = text(s.kind, 20) as PlanCustomSection['kind'];
    if (!CUSTOM_KINDS.includes(kind)) return [];
    const items = list(s.items).map(record).map(item => {
      const layout = text(item.layout, 20);
      const colourFrom = text(item.colourFrom, 60);
      return { name: text(item.name, 60), layout: (LAYOUTS as readonly string[]).includes(layout) ? layout : 'split', ...(colourFrom ? { colourFrom } : {}) };
    }).filter(item => item.name).slice(0, 10);
    return items.length ? [{ kind, why: text(s.why, 200), items }] : [];
  }).slice(0, 2);
  const colour = record(input.colour);
  const accent = text(colour.accent, 7).toLowerCase();
  const palette = c.palettes.includes(text(colour.palette, 40)) ? text(colour.palette, 40) : c.palettes[0];
  const fontsIn = record(input.fonts);
  const fonts = { id: c.fonts.includes(text(fontsIn.id, 40)) ? text(fontsIn.id, 40) : c.fonts[0], why: text(fontsIn.why, 200) };
  const motifIn = record(input.motif);
  const motif = text(motifIn.what, 60) ? { what: text(motifIn.what, 60), from: text(motifIn.from, 60) } : undefined;
  const brands = [...new Set(list(input.brands).map(b => text(b, 60)).filter(Boolean))].slice(0, 12);
  const card = list(input.card).map(line => text(line, 140)).filter(Boolean).slice(0, 7);
  return { version: 1, parts, sections, custom, colour: { palette, ...(HEX.test(accent) ? { accent } : {}), from: text(colour.from, 60) }, fonts, ...(motif ? { motif } : {}), brands, card, revision };
}
