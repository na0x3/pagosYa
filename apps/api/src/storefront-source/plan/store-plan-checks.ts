import type { StorePlan } from './store-plan';

/** What the store's own data says; read once per plan (store-plan-data.ts). */
export type CatalogFacts = { productNames: string[]; productCount: number; photoCount: number; categorySizes: number[];
  colourProducts: number; colourPhotoProducts: number; sizeProducts: number };
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

export function checkPlan(input: StorePlan, facts: CatalogFacts, rolled: Record<string, string>): CheckedPlan {
  const plan: StorePlan = structuredClone(input);
  const variants: Record<string, string> = { ...rolled };
  for (const [part, chosen] of Object.entries(plan.parts)) if (reasoned(chosen.why)) variants[part] = chosen.id; else delete plan.parts[part];
  plan.sections = plan.sections.filter(section => reasoned(section.why));
  if (plan.motif && !validSource(plan.motif.from, facts.photoCount)) delete plan.motif;

  // Colour comes from the brand or product on screen, never invented.
  if (plan.colour.accent && !validSource(plan.colour.from, facts.photoCount)) delete plan.colour.accent;
  plan.custom = plan.custom.map(section => ({ ...section, items: section.items.map(({ colourFrom, ...item }) => validSource(colourFrom, facts.photoCount) ? { ...item, colourFrom } : item) }));

  // Taste rules (owner 2026-10-22): normal cards, no dark text-only band.
  if (variants.grid === 'feature' && facts.productCount > 4) variants.grid = 'grid4';
  if (variants.closing === 'dark') variants.closing = facts.photoCount > 0 ? 'photo' : 'newsletter';

  // The catalog switches features on by itself, each with the line that says why.
  const lines: string[] = [];
  const dna: Record<string, string> = {};
  if (facts.colourProducts >= 2 && facts.colourPhotoProducts >= 2) {
    dna.card = 'swatch-swap';
    lines.push(`Muestras y filtro de color: ${facts.colourProducts} productos vienen en colores`);
  }
  if (facts.productCount >= 12) { variants.filters = 'sidebar'; lines.push(`Filtros a un lado: ${facts.productCount} productos para explorar`); }
  const browsable = facts.categorySizes.filter(size => size >= 3).length;
  variants.menu = browsable >= 2 ? 'dropdowns' : variants.menu === 'panel' && facts.categorySizes.length >= 2 ? 'panel' : 'none';
  if (variants.menu === 'dropdowns') lines.push(`Menú con ${facts.categorySizes.length} categorías desplegables`);
  const sections = plan.sections.map(section => section.id);
  if (facts.sizeProducts >= 1 && !sections.includes('sizes')) { sections.push('sizes'); lines.push('Guía de tallas: hay productos con tallas'); }

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
