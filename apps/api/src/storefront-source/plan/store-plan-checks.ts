import type { StorePlan } from './store-plan';

/** What the store's own data says; read once per plan (store-plan-data.ts). */
export type CatalogFacts = { productNames: string[]; productCount: number; photoCount: number; categorySizes: number[];
  colourProducts: number; colourPhotoProducts: number; sizeProducts: number;
  /** How many photos the plan call was shown; «foto N» is checked against these (final review 2026-10-22). */
  shownPhotos?: number };
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
  if ((variants.hero === 'collage' || variants.hero === 'strip') && facts.photoCount < 3) variants.hero = facts.photoCount ? 'split-right' : 'type';
  if (variants.story === 'pair' && facts.photoCount < 2) variants.story = facts.photoCount ? 'split' : 'quote';
  if (variants.filters === 'sidebar' && facts.productCount < 12) variants.filters = 'bar';
  if (facts.productCount >= 12) variants.filters = 'sidebar';
  const browsable = facts.categorySizes.filter(size => size >= 3).length;
  variants.menu = browsable >= 2 ? 'dropdowns' : variants.menu === 'panel' && facts.categorySizes.length >= 2 ? 'panel' : 'none';
  return variants;
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
    lines.push(`Una sección por marca: ${plan.brands.length} marcas, cada una distinta`);
  }

  const known = (line: string) => plan.card.some(existing => existing.toLowerCase().startsWith(line.split(':')[0].toLowerCase()));
  plan.card = [...plan.card, ...lines.filter(line => !known(line))].slice(0, 7);
  return { plan, dna, variants, sections: sections.slice(0, 4) };
}
