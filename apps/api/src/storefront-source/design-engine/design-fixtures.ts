import type { CreativePlan } from './design-schemas';
import { attachDesign, fallbackCreative, inferBrand, plannedStructure, sketchDirection, type DesignInput } from './design-engine';
import { repairSketch } from '../sketch/sketch-schema';
import { countSubstance } from '../sketch/sketch-substance';

/** Synthetic merchant records; media comes from existing repository demo assets, never references. */
export const DESIGN_FIXTURES: Array<{ id: string; input: DesignInput; sources: Record<string, string>; plan?: CreativePlan }> = [
  {
    id: 'coffee', input: {
      prompt: 'Build an independent coffee store with an underground magazine feel, bold typography and record-store culture.',
      store: { name: 'AFTER HOURS', category: 'Coffee', description: 'Coffee, breakfast and records. A place to pause between tracks.' },
      purpose: 'shop', designSeed: 'coffee-1', newsletterEnabled: true,
      categories: [{ id: 'coffee', name: 'Coffee' }, { id: 'records', name: 'Records' }],
      products: [{ id: 'coffee-1', name: 'House blend', amount: 12000, currency: 'BOB', categoryId: 'coffee', description: 'Coffee for your daily pause.', imageUrls: ['assets/product-1.webp'] }, { id: 'coffee-2', name: 'Breakfast set', amount: 4500, currency: 'BOB', categoryId: 'coffee', description: 'The breakfast selection.', imageUrls: ['assets/product-2.webp'] }, { id: 'coffee-3', name: 'Sunday sessions', amount: 18000, currency: 'BOB', categoryId: 'records', description: 'A record for slow weekends.', imageUrls: ['assets/product-1.webp'] }],
      assets: [{ path: 'assets/scene-1.webp', role: 'lifestyle', description: 'Breakfast on a coffee table' }, { path: 'assets/scene-2.webp', role: 'lifestyle', description: 'A breakfast selection' }, { path: 'assets/product-1.webp', role: 'product', description: 'Coffee and breakfast selection' }, { path: 'assets/product-2.webp', role: 'product', description: 'Granola bowl' }],
    }, sources: { 'scene-1': 'examples/independent-cafe/assets/breakfast.webp', 'scene-2': 'examples/savia/assets/granola.jpg', 'product-1': 'examples/independent-cafe/assets/breakfast.webp', 'product-2': 'examples/savia/assets/granola.jpg' },
  },
  {
    id: 'botanical', input: {
      prompt: 'Create a playful premium botanical skincare shop with floral color, expressive typography and giftable product photography.',
      store: { name: 'PETAL CLUB', category: 'Botanical skincare', description: 'Soap and cream for a little time to yourself.' },
      purpose: 'shop', designSeed: 'petal-club-02', newsletterEnabled: true,
      categories: [{ id: 'soap', name: 'Soap' }, { id: 'cream', name: 'Cream' }],
      products: [{ id: 'petal-1', name: 'Morning soap', amount: 8500, currency: 'BOB', categoryId: 'soap', description: 'A bar for your morning ritual.', imageUrls: ['assets/product-1.webp'] }, { id: 'petal-2', name: 'Daily cream', amount: 14500, currency: 'BOB', categoryId: 'cream', description: 'A daily cream.', imageUrls: ['assets/product-2.webp'] }, { id: 'petal-3', name: 'The little pair', amount: 21000, currency: 'BOB', categoryId: 'cream', description: 'Soap and cream together.', imageUrls: ['assets/product-1.webp'] }],
      assets: [{ path: 'assets/product-1.webp', role: 'product', description: 'Soap packaging' }, { path: 'assets/product-2.webp', role: 'product', description: 'Cream packaging' }, { path: 'assets/scene-1.webp', role: 'lifestyle', description: 'Cream in a botanical scene' }, { path: 'assets/scene-2.webp', role: 'lifestyle', description: 'Soap in a botanical scene' }],
    }, sources: { 'product-1': 'examples/premium-benchmark-photos/fixtures/beauty/jabon.jpg', 'product-2': 'examples/premium-benchmark-photos/fixtures/beauty/crema.jpg', 'scene-1': 'examples/premium-benchmark-photos/beauty-photo-1/scene-crema.jpg', 'scene-2': 'examples/premium-benchmark-photos/beauty-photo-1/scene-jabon.jpg' },
  },
  {
    id: 'home', input: {
      prompt: 'Build a sophisticated minimal premium home collection with generous whitespace and image-led asymmetric composition.',
      store: { name: 'FORME', category: 'Home textiles', description: 'Throws and cushions. Simple pieces for the spaces we inhabit.' },
      purpose: 'shop', designSeed: 'home-0', newsletterEnabled: false,
      categories: [{ id: 'throws', name: 'Throws' }, { id: 'cushions', name: 'Cushions' }],
      products: [{ id: 'forme-1', name: 'Soft throw', amount: 36000, currency: 'BOB', categoryId: 'throws', description: 'A throw for the living room.', imageUrls: ['assets/product-1.webp'] }, { id: 'forme-2', name: 'Quiet cushion', amount: 19000, currency: 'BOB', categoryId: 'cushions', description: 'A cushion for your favorite chair.', imageUrls: ['assets/product-2.webp'] }, { id: 'forme-3', name: 'The living set', amount: 52000, currency: 'BOB', categoryId: 'throws', description: 'Throw and cushion together.', imageUrls: ['assets/product-1.webp'] }],
      assets: [{ path: 'assets/scene-1.webp', role: 'lifestyle', description: 'Throw in a living room' }, { path: 'assets/scene-2.webp', role: 'lifestyle', description: 'Cushion on a chair' }, { path: 'assets/product-1.webp', role: 'product', description: 'Throw' }, { path: 'assets/product-2.webp', role: 'product', description: 'Cushion' }],
    }, sources: { 'product-1': 'examples/premium-benchmark-photos/fixtures/home/manta.jpg', 'product-2': 'examples/premium-benchmark-photos/fixtures/home/cojin.jpg', 'scene-1': 'examples/premium-benchmark-photos/home-photo-1/scene-manta.jpg', 'scene-2': 'examples/premium-benchmark-photos/home-photo-1/scene-cojin.jpg' },
  },
];

export function generateDesignFixture(input: DesignInput, chosenPlan?: CreativePlan) {
  const brand = inferBrand(input), plan = chosenPlan ?? fallbackCreative(input, brand);
  const ctx = { storeName: input.store.name, purpose: input.purpose, photos: input.assets.map(a => a.path) };
  const structure = plannedStructure(plan, countSubstance({ products: input.products, categories: input.categories, photos: input.assets, brief: input.store }), input.purpose, !!input.newsletterEnabled);
  const categories = input.categories as Array<{ id: string; name: string }>;
  const skeleton = { palette: plan.palette, fonts: plan.fonts, style: sketchDirection(plan).style, blocks: structure.slots.map(slot => ({ ...slot, bg: slot.type === 'footer' ? 'deep' : slot.type === 'story' ? 'accent' : 'paper',
    headline: input.store.name, sub: input.store.description, cta: slot.type === 'newsletter' ? 'Subscribe' : 'Explore the collection', title: slot.type === 'catalog' ? `Explore ${input.store.category?.toLowerCase() || 'the collection'}` : slot.type === 'gallery' ? `${input.store.name}, in pictures` : slot.type === 'story' ? input.store.description?.split('.')[0] : slot.type === 'collections' ? categories.map(c => c.name).join(' / ') : 'Stay in the loop',
    paragraphs: [input.store.description], photos: input.assets.filter(a => a.role === 'lifestyle').map(a => a.path),
    items: categories.map(c => ({ title: c.name, text: `Explore ${c.name.toLowerCase()}` })),
    tagline: input.store.description, wordmark: 'giant', variant: 'photo-right',
  })) };
  const sketch = repairSketch(skeleton, ctx, { structure }).sketch;
  return attachDesign(sketch, input, brand, plan, 'fallback');
}

/** Same merchant facts, catalog and imagery; only the creative brief/seed and chosen composition
 * change. These are deterministic, authored capability benchmarks, not paid model evaluations. */
export const AFTER_HOURS_FIXTURES = [
  { id: 'after-hours-magazine', direction: 'Underground magazine', hero: 'magazine-cover', catalog: 'horizontal-rail', story: 'manifesto', gallery: 'mosaic', categories: 'editorial-index', footer: 'giant-wordmark', order: ['hero', 'catalog', 'story', 'gallery', 'collections', 'footer'], airy: false },
  { id: 'after-hours-records', direction: 'Record-shop brutalist', hero: 'poster', catalog: 'editorial-index', story: 'oversized-quote', gallery: 'horizontal-strip', categories: 'large-type-links', footer: 'editorial-columns', order: ['hero', 'collections', 'catalog', 'gallery', 'story', 'footer'], airy: false },
  { id: 'after-hours-cafe', direction: 'Warm European café editorial', hero: 'editorial-split', catalog: 'product-spotlight', story: 'editorial-split', gallery: 'full-bleed', categories: 'image-categories', footer: 'minimal', order: ['hero', 'gallery', 'catalog', 'story', 'collections', 'footer'], airy: true },
].map(direction => {
  const source = DESIGN_FIXTURES[0];
  const input: DesignInput = { ...source.input, prompt: `Design AFTER HOURS as ${direction.direction}. Keep the supplied coffee, breakfast and records facts.`, designSeed: direction.id, newsletterEnabled: false,
    products: source.input.products.map((product, i) => ({ ...(product as Record<string, unknown>), name: i === 0 ? 'Coffee + croissant' : i === 1 ? 'House granola' : 'Sunday sessions', description: i === 0 ? 'Coffee and a croissant.' : i === 1 ? 'Granola for breakfast.' : 'A record for slow weekends.', imageUrls: i === 2 ? [] : (product as { imageUrls: string[] }).imageUrls })),
    assets: [...source.input.assets, { path: 'assets/scene-3.webp', role: 'brand-editorial', description: 'Breakfast drinks' }, { path: 'assets/scene-4.webp', role: 'brand-editorial', description: 'Bottled drinks' }] };
  const base = fallbackCreative(input, inferBrand(input));
  const variants: Record<string, string> = { hero: direction.hero, catalog: direction.catalog, story: direction.story, gallery: direction.gallery, collections: direction.categories, footer: direction.footer };
  const plan: CreativePlan = { ...base, artDirection: { ...base.artDirection, style: direction.airy ? 'lifestyle' : direction.id.endsWith('records') ? 'industrial' : 'editorial', layoutDensity: direction.airy ? 'airy' : 'balanced' },
    palette: direction.airy ? { paper: '#f3efe5', ink: '#32352a', accent: '#545e36', deep: '#343b29', pop: '#dccfba' } : direction.id.endsWith('records') ? { paper: '#e7e5db', ink: '#171714', accent: '#8a2f1f', deep: '#242422', pop: '#c9cc66' } : base.palette,
    fonts: { display: direction.airy ? 'instrument-serif' : direction.id.endsWith('records') ? 'anton' : 'oswald', text: 'epilogue' },
    displayScale: direction.airy ? 6 : 9.5,
    sections: direction.order.map(type => ({ type: type as CreativePlan['sections'][number]['type'], composition: variants[type], intent: `A purposeful ${type} composition for ${direction.direction}`, productRefs: type === 'catalog' ? input.products.map(p => String((p as { id: string }).id)) : [] })) };
  return { id: direction.id, input, plan, sources: { ...source.sources, 'scene-3': 'examples/savia/assets/juice.jpg', 'scene-4': 'examples/savia/assets/bottles.jpg' } };
});
