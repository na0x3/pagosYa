import type { StorePlan } from './store-plan';

/** What the store's own data says; read once per plan (store-plan-data.ts). */
export type CatalogFacts = { productNames: string[]; productCount: number; photoCount: number; categorySizes: number[];
  colourProducts: number; colourPhotoProducts: number; sizeProducts: number;
  /** How many photos the plan call was shown; «foto N» is checked against these (final review 2026-10-22). */
  shownPhotos?: number;
  /** The merchant's own words asked for a gallery or collage; otherwise the cover has one photo at most (owner 2026-10-23). */
  photoGroups?: boolean };
export type CheckedPlan = { plan: StorePlan; dna: Record<string, string>; variants: Record<string, string>; sections: string[] };

/** Owner 2026-10-22: «no random circles». A reason that names nothing of this store is no reason. */
const GENERIC = /^(se ve (bien|moderno|bonito|elegante)|moderno|bonito|elegante|atractivo|para destacar|queda bien|más visual)\.?$/i;
const reasoned = (why: string | undefined) => Boolean(why && why.trim().length >= 12 && !GENERIC.test(why.trim()));

/** «logo», «marca» (a merchant-confirmed colour) or «foto N» for a photo the plan was shown. */
export function validSource(from: string | undefined, photoCount: number): boolean {
  const value = (from ?? '').trim().toLowerCase();
  if (value === 'logo' || value === 'marca') return true;
  const photo = /^foto (\d+)$/.exec(value);
  return Boolean(photo && Number(photo[1]) < photoCount);
}

/** Final review 2026-10-22: the rules every part obeys, whoever chose it (the plan, the dice or a uniqueness swap). */
export function enforceRules(input: Record<string, string>, facts: CatalogFacts): Record<string, string> {
  const variants = { ...input };
  if (variants.grid === 'feature' && facts.productCount > 4) variants.grid = 'grid4';
  if (variants.closing === 'dark') variants.closing = facts.photoCount > 0 ? 'photo' : 'newsletter';
  // Owner 2026-10-22: product pages that open on a full-screen photo hide the name, price and buy button.
  if (variants.pdp === 'stacked' || variants.pdp === 'editorial') variants.pdp = 'gallery-left';
  // Photo groups need the photos (and the owner allows them only when asked); a text hero when there are none.
  // Owner 2026-10-23: one photo at most on the cover; a collage or strip only when the merchant asks for one.
  if ((variants.hero === 'collage' || variants.hero === 'strip') && (facts.photoCount < 3 || !facts.photoGroups)) variants.hero = facts.photoCount ? 'split-right' : 'type';
  if (variants.story === 'pair' && facts.photoCount < 2) variants.story = facts.photoCount ? 'split' : 'quote';
  if (variants.filters === 'sidebar' && facts.productCount < 12) variants.filters = 'bar';
  if (facts.productCount >= 12) variants.filters = 'sidebar';
  const browsable = facts.categorySizes.filter(size => size >= 3).length;
  variants.menu = browsable >= 2 ? 'dropdowns' : variants.menu === 'panel' && facts.categorySizes.length >= 2 ? 'panel' : 'none';
  return variants;
}

/** Live check 2026-10-22: the model's card listed prices, stock and delivery. The card says what the store will look like. */
const CATALOG_FACT = /\b(precios?|stock|delivery|pickup|retiro|env[ií]os?|checkout|carrito|pagos?|agotad[oa]s?|descuentos?|productos con)\b/i;
const SECTION_NAMES: Record<string, string> = { process: 'Cómo lo hacemos', pick: 'Arma tu selección', sizes: 'Guía de tallas', gallery: 'Galería', faq: 'Preguntas frecuentes',
  visit: 'Visítanos', materials: 'Materiales', howto: 'Cómo se usa', team: 'Quiénes somos', quotes: 'Lo que dicen', journal: 'Diario', manifesto: 'Manifiesto' };
const KIND_NAMES: Record<string, string> = { 'per-category': 'una sección por categoría', facts: 'una sección de datos del producto', origin: 'una sección del origen', guide: 'una guía de uso' };
const list = (names: string[]) => names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0] ?? '';
const sourceWords = (from: string) => from === 'logo' ? 'tu logo' : from === 'marca' ? 'tu marca' : `la ${from}`;

function cardLines(plan: StorePlan, sections: string[], featureLines: string[], shown: number): string[] {
  const design: string[] = [];
  const from = plan.colour.from.trim().toLowerCase();
  design.push(`Colores: fondo claro, tinta oscura y un acento${validSource(from, shown) ? ` sacado de ${sourceWords(from)}` : ''}`);
  for (const section of plan.custom) design.push(section.kind === 'per-brand' ? `Una sección por marca: ${list(section.items.map(item => item.name))}, cada una distinta` : `Sección propia: ${KIND_NAMES[section.kind] ?? section.kind}`);
  const named = sections.map(id => SECTION_NAMES[id]).filter(Boolean);
  if (named.length) design.push(`Secciones: ${list(named)}`);
  if (plan.motif) design.push(`Detalle de marca: ${plan.motif.what}${validSource(plan.motif.from, shown) ? ` de ${sourceWords(plan.motif.from.trim().toLowerCase())}` : ''}`);
  const own = plan.card.filter(line => !CATALOG_FACT.test(line) && !/^(colores|una sección por marca|secciones|detalle de marca)\b/i.test(line.trim()));
  return [...design, ...featureLines, ...own].slice(0, 7);
}

export function checkPlan(input: StorePlan, facts: CatalogFacts, rolled: Record<string, string>): CheckedPlan {
  const plan: StorePlan = structuredClone(input);
  const shown = facts.shownPhotos ?? facts.photoCount;
  const variants: Record<string, string> = { ...rolled };
  for (const [part, chosen] of Object.entries(plan.parts)) if (reasoned(chosen.why)) variants[part] = chosen.id; else delete plan.parts[part];
  plan.sections = plan.sections.filter(section => reasoned(section.why));
  if (plan.motif && !validSource(plan.motif.from, shown)) delete plan.motif;

  // Colour comes from the brand or product on screen, never invented.
  // The model never sees the logo's pixels: a logo or brand accent comes from the logo palette or the confirmed colours, not its hex.
  if (plan.colour.accent && (!validSource(plan.colour.from, shown) || /^(logo|marca)$/i.test(plan.colour.from.trim()))) delete plan.colour.accent;
  plan.custom = plan.custom.map(section => ({ ...section, items: section.items.map(({ colourFrom, ...item }) => validSource(colourFrom, shown) ? { ...item, colourFrom } : item) }));

  Object.assign(variants, enforceRules(variants, facts));

  // The catalog switches features on by itself, each with the line that says why.
  const lines: string[] = [];
  const dna: Record<string, string> = {};
  if (facts.colourProducts >= 2 && facts.colourPhotoProducts >= 2) {
    dna.card = 'swatch-swap';
    lines.push(`Muestras y filtro de color: ${facts.colourProducts} productos vienen en colores`);
  }
  if (facts.productCount >= 12) lines.push(`Filtros a un lado: ${facts.productCount} productos para explorar`);
  if (variants.menu === 'dropdowns') lines.push(`Menú con ${facts.categorySizes.length} categorías desplegables`);
  let sections = plan.sections.map(section => section.id);
  // A size guide the catalog needs is kept within the four-section cap.
  if (facts.sizeProducts >= 1 && !sections.includes('sizes')) { sections = [...sections.slice(0, 3), 'sizes']; lines.push('Guía de tallas: hay productos con tallas'); }

  // A brand counts only when a product carries its name; per-brand sections need three of them.
  plan.brands = plan.brands.filter(brand => facts.productNames.some(name => name.toLowerCase().includes(brand.toLowerCase())));
  if (plan.brands.length < 3) plan.custom = plan.custom.filter(section => section.kind !== 'per-brand');
  else if (!plan.custom.some(section => section.kind === 'per-brand')) {
    plan.custom.push({ kind: 'per-brand', why: `${plan.brands.length} marcas en el catálogo`, items: plan.brands.map(name => ({ name, layout: 'split' })) });
  }

  plan.card = cardLines(plan, sections, lines, shown);
  // The card never promises a photo collage the rules took away (live 2026-10-23: «Portada: collage con las 12 fotos»).
  if (!facts.photoGroups) plan.card = plan.card.filter(line => !/collage|mosaico|galer[ií]a|\b\d+ fotos\b/i.test(line));
  return { plan, dna, variants, sections: sections.slice(0, 4) };
}
