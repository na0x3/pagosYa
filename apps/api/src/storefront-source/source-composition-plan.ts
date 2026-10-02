import { BadGatewayException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export const SOURCE_COMPOSITION_FAMILIES = ['catalog-led', 'campaign-led', 'craft-story', 'technical-comparison', 'category-discovery', 'editorial-lookbook', 'menu-led'] as const;
const layouts = ['campaign', 'product-grid', 'category-grid', 'feature', 'comparison', 'editorial-gallery', 'text'] as const;
const geometries = ['fullbleed', 'split', 'contained', 'typographic', 'grid', 'rail'] as const;
const purposes = ['shopping', 'collection', 'story', 'lookbook', 'guide'] as const;
const roles = ['lead', 'support', 'product', 'detail', 'reference'] as const;
export type SourceCompositionPlan = {
  family: typeof SOURCE_COMPOSITION_FAMILIES[number]; rationale: string;
  pages: Array<{ page: string; purpose: typeof purposes[number]; rationale: string; sections: Array<{
    id: string; intent: string; layout: typeof layouts[number]; geometry: typeof geometries[number];
    media: Array<{ asset: string; role: typeof roles[number] }>; mobile: 'stack' | 'grid' | 'rail'; primaryAction: string;
  }> }>;
};
const prose = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength });
const enumSchema = (values: readonly string[]) => ({ type: 'string', enum: [...values] });
export const SOURCE_COMPOSITION_PLAN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['family', 'rationale', 'pages'], properties: {
    family: enumSchema(SOURCE_COMPOSITION_FAMILIES), rationale: prose(200),
    pages: { type: 'array', minItems: 1, maxItems: 4, items: {
      type: 'object', additionalProperties: false, required: ['page', 'purpose', 'rationale', 'sections'], properties: {
        page: { type: 'string', pattern: '^[a-z][a-z0-9-]*\\.html$', maxLength: 100 }, purpose: enumSchema(purposes), rationale: prose(160),
        sections: { type: 'array', minItems: 1, maxItems: 12, items: {
          type: 'object', additionalProperties: false, required: ['id', 'intent', 'layout', 'geometry', 'media', 'mobile', 'primaryAction'], properties: {
            id: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,47}$' }, intent: prose(120), layout: enumSchema(layouts), geometry: enumSchema(geometries),
            media: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['asset', 'role'], properties: { asset: prose(200), role: enumSchema(roles) } } },
            mobile: enumSchema(['stack', 'grid', 'rail']), primaryAction: prose(60),
          },
        } },
      },
    } },
  },
};
export const SOURCE_COMPOSITION_PLAN_DIRECTION = `Every new concept includes composition: a compact product-led plan, not a personal no-grid preference. Choose family from the real products, buying task, brand theme and asset roles. Plan index.html and only custom pages with an independent shopping, collection, story, lookbook or guide purpose. Do not plan product.html or checkout.html runtime surfaces. Homepage section IDs and order exactly match layout.sections. Each section declares intent, layout, geometry, media asset paths/IDs and roles, mobile reflow, and primaryAction. Catalog images supplied by the runtime need not be enumerated. Never use every upload merely because it exists. Unused photos remain unused; an extra gallery is not an overflow bin. Product grids, category grids, purposeful comparisons and coherent lookbooks are valid. Every editorial grouping needs a concrete thematic or buying reason, appropriate hierarchy and a mobile plan. Reference lessons: craft and provenance can support a focused product story; outdoor clothing can connect a campaign to category discovery; luggage can connect travel context to a useful product comparison; fashion can use a restrained campaign and shoppable collections. Adapt structures to the actual store, without copying reference copy, brand claims or assets. All pages share brand tokens and navigation. Distinguish concepts in geometry, catalog presentation and section sequence; do not add images or change approved colors merely to appear different. Commerce surfaces form one consistent store system: use layout.productPage and dna.productCard to prioritize the real decision information (fit and sizes for apparel, dimensions and materials for furniture, variants and options for food, evidenced specifications for technical products). Coordinate cart and checkout tokens, controls and product summaries with the same theme; retain clear totals, visible purchase actions, accessible inputs and familiar payment steps. Cards within one store follow one coherent family, with deliberate variants for different product needs. Design to reduce buying friction without promising conversion gains. Keep plans brief: generally 2–5 homepage sections and no extra page without a clear need.`;

export function validateSourceCompositionPlan(value: unknown, homepageSections: string[]): SourceCompositionPlan {
  const fail = (detail: string): never => { throw new BadGatewayException(`composition: ${detail}`); };
  const obj = (v: any, keys: string[]) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
  const text = (v: any, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const dump = (v: string) => /(?:use|show|display|fit|include|consume)\s+(?:all|every|remaining|leftover|unused)\s+(?:the\s+)?(?:uploaded\s+)?(?:images?|photos?|uploads?|assets?)|(?:remaining|leftover|unused)\s+(?:images?|photos?|uploads?)|(?:usar|mostrar|incluir)\s+(?:todas|todos)\s+(?:las|los)\s+(?:fotos|imagenes)/i.test(v);
  const plan = value as SourceCompositionPlan;
  if (!obj(plan, ['family', 'rationale', 'pages']) || !SOURCE_COMPOSITION_FAMILIES.includes(plan.family) || !text(plan.rationale, 200) || dump(plan.rationale) || !Array.isArray(plan.pages) || !plan.pages.length || plan.pages.length > 4) return fail('provide a product-led family, rationale and 1–4 purposeful pages.');
  const seen = new Set<string>();
  for (const page of plan.pages) {
    if (!obj(page, ['page', 'purpose', 'rationale', 'sections']) || !text(page.page, 100) || !/^[a-z][a-z0-9-]*\.html$/.test(page.page) || /(?:^|\/)(?:product|checkout|cart)\.html$/.test(page.page) || seen.has(page.page) || !purposes.includes(page.purpose) || !text(page.rationale, 160) || dump(page.rationale) || !Array.isArray(page.sections) || !page.sections.length || page.sections.length > 12) return fail('each page needs a unique safe custom .html path and a concrete purpose, never an upload disposal gallery.');
    seen.add(page.page);
    const ids = new Set<string>();
    for (const s of page.sections) {
      if (!obj(s, ['id', 'intent', 'layout', 'geometry', 'media', 'mobile', 'primaryAction']) || !/^[a-z][a-z0-9-]{0,47}$/.test(s.id) || ids.has(s.id) || !text(s.intent, 120) || dump(s.intent) || !layouts.includes(s.layout) || !geometries.includes(s.geometry) || !['stack', 'grid', 'rail'].includes(s.mobile) || !text(s.primaryAction, 60) || !Array.isArray(s.media) || s.media.length > 6) return fail('sections need unique IDs, a meaningful intent, layout, geometry, media roles, mobile reflow and action.');
      ids.add(s.id);
      if (s.media.some(m => !obj(m, ['asset', 'role']) || !text(m.asset, 200) || !roles.includes(m.role)) || new Set(s.media.map(m => m.asset)).size !== s.media.length) return fail('media must name unique available asset paths/IDs and explicit roles.');
    }
  }
  const home = plan.pages.find(p => p.page === 'index.html');
  if (!home || JSON.stringify(home.sections.map(s => s.id)) !== JSON.stringify(homepageSections)) return fail('index.html section IDs and order must match layout.sections.');
  return structuredClone(plan);
}

type StructuralConcept = { composition?: SourceCompositionPlan; layout?: { sections: string[]; catalogSection: string; productsInOpening: boolean; productPage?: string }; dna?: { layout?: { grammar?: string }; surfaces?: { card?: string; product?: string; cart?: string; review?: string } } };
function structure(concept: StructuralConcept): string[] {
  if (!concept.composition) return [concept.dna?.layout?.grammar ?? '', String(concept.layout?.productsInOpening ?? ''), concept.dna?.surfaces?.card ?? '', (concept.layout?.sections ?? []).map(id => id === concept.layout?.catalogSection ? 'catalog' : 'section').join('>')];
  return [...concept.composition.pages.flatMap(p => [p.purpose, ...p.sections.map(s => `${s.layout}:${s.geometry}:${s.mobile}:${s.media.map(m => m.role).sort().join(',')}`)]),
    `product:${concept.dna?.surfaces?.product ?? concept.layout?.productPage ?? ''}`, `cart:${concept.dna?.surfaces?.cart ?? ''}`,
    `review:${concept.dna?.surfaces?.review ?? ''}`, `card:${concept.dna?.surfaces?.card ?? ''}`];
}
/** Ignores copy, colors, fonts, IDs and asset filenames; measures the buying composition. */
export function compositionFingerprint(concept: StructuralConcept): string { return createHash('sha256').update(JSON.stringify(structure(concept))).digest('hex').slice(0, 24); }
export function compositionDistance(a: StructuralConcept, b: StructuralConcept): number {
  const left = structure(a), right = structure(b), count = Math.max(left.length, right.length);
  return count ? Array.from({ length: count }, (_, i) => left[i] === right[i] ? 0 : 1).reduce<number>((sum, v) => sum + v, 0) / count : 0;
}
