import { sketchComponent } from '@pagosya/shared-types';
import { defaultDna, normalizeDna } from '../source-dna';
import { sketchImageRole, isSceneImage, isProductImage } from '../sketch/sketch-assets';
import { createHash } from 'node:crypto';
import { sectionCompositions, type BrandDirection, type WebsiteDesignSpec, type DesignQuality } from '@pagosya/shared-types';
import { brandDirectionSchema, creativePlanSchema, type CreativePlan } from './design-schemas';
import { syncDesignSpec, tokensForSketch } from './design-document';
import { DEFAULT_SKETCH_STYLE, repairSketch, sketchButtonStyle, bestInkFor, contrastRatio, resolveBg, type StoreSketch, type SketchBlock, type SketchContext } from '../sketch/sketch-schema';
import type { PageStructure } from '../sketch/sketch-structure-draw';
import { substanceCaps, type StoreSubstance } from '../sketch/sketch-substance';
import { catalogueDigest } from '../sketch/sketch-catalogue-digest';
import { sourceSketchCompositionCandidates } from '../source-composition-registry';
import { DESIGN_PROMPT_VERSION } from './design-prompts';
export type DesignInput = {
  prompt: string; store: { name: string; description?: string; category?: string }; brief?: unknown;
  products: unknown[]; categories: unknown[];
  assets: Array<{ path: string; role?: string; description?: string; productId?: string }>;
  designSeed: string; purpose: 'shop' | 'service'; newsletterEnabled?: boolean;
};
export function seededRandom(seed: string): () => number {
  let state = parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16);
  return () => { state += 0x6D2B79F5; let n = state; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}
export const designSeedFor = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 24);
export function inferBrand(input: DesignInput): BrandDirection {
  const catalogue = catalogueDigest(input.products, input.categories);
  const brief = input.brief as { audience?: string; businessType?: string; primaryAction?: string } | undefined;
  const language = /\b(make|build|create|coffee|premium|playful|fashion|home)\b/i.test(input.prompt) ? 'en' : 'es';
  const playful = /playful|juguet|color|botanic|floral/i.test(input.prompt);
  return brandDirectionSchema.parse({ businessType: (input.store.category || brief?.businessType || catalogue.totals.categories.join(', ') || 'Commerce').slice(0, 500),
    positioning: (input.store.description || `${input.store.name}: ${catalogue.totals.categories.join(', ') || catalogue.items.map(i => i.name).slice(0, 3).join(', ') || 'Store opening soon'}`).slice(0, 500),
    audience: [(brief?.audience || (language === 'en' ? 'People interested in this catalog' : 'Personas interesadas en este catálogo')).slice(0, 500)],
    personality: playful ? ['playful', 'expressive'] : /minimal|sophistic|lujo|premium/i.test(input.prompt) ? ['considered', 'confident'] : ['independent', 'direct'],
    visualKeywords: playful ? ['image-led', 'colorful'] : /magazine|revista|editorial/i.test(input.prompt) ? ['editorial', 'typographic'] : ['product-led', 'intentional'],
    contentTone: language === 'en' ? 'Concise English, grounded in merchant facts' : 'Español conciso, basado en datos del comercio',
    pricePositioning: /luxury|lujo/i.test(input.prompt) ? 'luxury' : /premium/i.test(input.prompt) ? 'premium' : 'mid-market',
    primaryConversionGoal: (brief?.primaryAction || (input.purpose === 'shop' ? 'Shop the catalog' : 'Contact the business')).slice(0, 500), secondaryGoals: ['Explore the brand'],
  });
}
/** Brand-aware fallbacks are operational defaults, not a fixed page recipe. Seeded choices happen
 * within the inferred creative direction. The model is free to choose any registered composition. */
export function fallbackCreative(input: DesignInput, brand: BrandDirection): CreativePlan {
  const random = seededRandom(input.designSeed);
  const pick = <T>(values: readonly T[]) => values[Math.floor(random() * values.length)];
  const cues = `${input.prompt} ${input.store.category} ${brand.visualKeywords.join(' ')} ${brand.personality.join(' ')}`;
  const botanical = /botanic|floral|tea|té|skincare|playful|juguet/i.test(cues);
  const premium = !botanical && /minimal|sophistic|fashion|home|lujo|luxury/i.test(cues);
  const style = botanical ? 'playful' : premium ? 'minimal' : 'editorial';
  const photo = input.assets.some(a => a.role !== 'logo');
  const pickCompatible = (type: string, variants: string[]) => {
    const candidates = sourceSketchCompositionCandidates({ style, density: premium ? 'airy' : 'balanced', text: cues, catalogItems: input.products.length, assets: input.assets, newsletterEnabled: input.newsletterEnabled }).filter(entry => entry.type === type && entry.fit.eligible);
    const preferred = candidates.filter(entry => variants.includes(entry.variant));
    const fitting = preferred.length ? preferred : candidates;
    const best = Math.max(...fitting.map(entry => entry.fit.score));
    return pick(fitting.filter(entry => entry.fit.score >= best - 4)).variant;
  };
  const hero = photo ? pickCompatible('hero', botanical ? ['floating-media', 'asymmetric-collage', 'product-stage'] : premium ? ['full-bleed', 'editorial-split', 'magazine-cover'] : ['editorial-split', 'magazine-cover', 'poster']) : 'statement';
  const catalog = pickCompatible('catalog', botanical ? ['oversized-two-up', 'horizontal-rail'] : premium ? ['product-spotlight', 'lookbook', 'asymmetric-grid'] : ['horizontal-rail', 'editorial-index', 'asymmetric-grid']);
  const core: CreativePlan['sections'] = [{ type: 'hero', composition: hero, intent: 'Introduce the brand and provide a clear shopping action' }];
  if (input.purpose === 'shop') core.push({ type: 'catalog', composition: catalog, intent: 'Shop actual products and prices' });
  const story = { type: 'story' as const, composition: premium ? 'editorial-split' : botanical ? 'chapters' : 'manifesto', intent: 'Tell the brand story using only merchant information' };
  if (random() > 0.5) core.splice(1, 0, story); else core.push(story);
  if (input.assets.filter(a => a.role !== 'logo').length >= 2) core.push({ type: 'gallery', composition: premium ? 'full-bleed' : botanical ? 'asymmetric-collage' : 'mosaic', intent: 'Show supplied brand photography' });
  if (catalogueDigest(input.products, input.categories).totals.categories.length >= 2) core.push({ type: 'collections', composition: pick(['editorial-index', 'large-type-links', 'image-categories']), intent: 'Explore the real categories' });
  if (input.newsletterEnabled) core.push({ type: 'newsletter', composition: 'center', intent: 'Subscribe to updates' });
  core.push({ type: 'footer', composition: premium ? 'minimal' : 'giant-wordmark', intent: 'Brand signature and navigation' });
  return creativePlanSchema.parse({ artDirection: { style, layoutDensity: premium ? 'airy' : 'balanced', composition: premium ? 'asymmetric' : 'editorial', imageTreatment: botanical ? 'contain' : 'cover', typographyTreatment: premium ? 'High contrast serif and quiet body type' : botanical ? 'Expressive display with restrained body' : 'Oversized condensed display and neutral body', motionLevel: 'subtle', cornerStyle: botanical ? 'soft' : 'square', sectionRhythm: 'Alternate typographic moments and product photography' },
    palette: botanical ? { paper: '#fff4e5', ink: '#29231f', accent: '#a51e40', deep: '#273e30', pop: '#ebcc5e' } : premium ? { paper: '#eeece6', ink: '#252520', accent: '#514b42', deep: '#242b26', pop: '#c9b798' } : { paper: '#f2ead9', ink: '#201e19', accent: '#b33a16', deep: '#242a23', pop: '#e6c747' },
    fonts: { display: premium ? 'instrument-serif' : botanical ? 'bricolage' : 'oswald', text: 'epilogue' }, navigation: premium ? 'minimal' : botanical ? 'centered' : 'editorial', displayScale: premium ? 7 : 8.5, bodyScale: 1, sections: core });
}

/** Reject structurally valid but unsuitable variants using the owned registry, before rendering. */
export function compatibleCreativePlan(plan: CreativePlan, input: DesignInput): CreativePlan {
  const fitInput = { style: plan.artDirection.style, density: plan.artDirection.layoutDensity, text: `${input.prompt} ${input.store.category || ''}`, catalogItems: input.products.length, assets: input.assets, newsletterEnabled: input.newsletterEnabled };
  const candidates = sourceSketchCompositionCandidates(fitInput);
  return { ...plan, sections: plan.sections.map(section => {
    const entry = candidates.find(candidate => candidate.type === section.type && candidate.variant === section.composition);
    if (entry?.fit.eligible) return section;
    const alternatives = candidates.filter(candidate => candidate.type === section.type && candidate.fit.eligible).sort((a, b) => b.fit.score - a.fit.score);
    return alternatives.length ? { ...section, composition: alternatives[0].variant } : section;
  }) };
}

export function plannedStructure(plan: CreativePlan, substance: StoreSubstance, purpose: 'shop' | 'service', newsletter: boolean): PageStructure {
  const caps = substanceCaps(substance);
  // Never fabricate social proof: published count alone supplies no quote content.
  const banned = new Set([...caps.forbid, 'reviews', ...(!newsletter ? ['newsletter'] : []), ...(purpose === 'service' ? ['catalog'] : [])]);
  const used = new Set<string>();
  const sections = plan.sections.filter(s => !banned.has(s.type) && s.type !== 'footer' && !used.has(s.type) && !!used.add(s.type));
  if (!sections.some(s => s.type === 'hero')) sections.unshift({ type: 'hero', composition: 'statement', intent: 'Brand introduction' });
  if (purpose === 'shop' && !sections.some(s => s.type === 'catalog')) sections.splice(1, 0, { type: 'catalog', composition: 'grid', intent: 'Shop' });
  const types = [...sections.slice(0, caps.maxLength - 1), { type: 'footer' as const }];
  const slots = types.map((s, i) => ({ id: `s${i + 1}`, type: s.type, size: i === 0 ? 'xl' as const : s.type === 'footer' ? 'm' as const : i % 2 ? 'm' as const : 'l' as const,
    width: sketchComponent(s.type, 'composition' in s ? s.composition as string : undefined)?.defaultWidth ?? (s.type === 'footer' ? 'bleed' as const : 'wide' as const),
    media: substance.photos > 0 && ['hero', 'story', 'gallery', 'split', 'collections'].includes(s.type) }));
  return { slots, params: { length: slots.length, opening: slots[0].type, catalogAt: 0.3, accentEvery: null, rhythm: 'alternating', mediaBudget: substance.photos } };
}
export function sketchDirection(plan: CreativePlan) {
  const style = { ...DEFAULT_SKETCH_STYLE, radius: plan.artDirection.cornerStyle, buttons: plan.artDirection.style === 'minimal' ? 'outline' as const : 'square' as const, cards: 'bleed' as const, header: plan.navigation === 'centered' ? 'center' as const : 'left' as const, badges: 'square' as const, links: 'underline' as const };
  return { style, newsletterForm: 'underline' as const, name: `${plan.artDirection.style} · ${plan.artDirection.typographyTreatment}`, lines: [JSON.stringify(plan), 'Use the supplied palette and font ids. Every section follows this direction.'] };
}

export function attachDesign(sketch: StoreSketch, input: DesignInput, brand: BrandDirection, plan: CreativePlan, mode: 'ai' | 'fallback'): StoreSketch {
  const fallback = repairSketch({ ...sketch, palette: plan.palette, fonts: plan.fonts, style: sketchDirection(plan).style }, { storeName: input.store.name, purpose: input.purpose, photos: input.assets.map(a => a.path) }).sketch;
  const variants = new Map(plan.sections.map(s => [s.type, s.composition]));
  const ownedProductIds = input.products.flatMap(product => { const p = product as { id?: unknown }; return typeof p.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(p.id) ? [p.id] : []; });
  const plannedProducts = plan.sections.find(section => section.type === 'catalog')?.productRefs?.filter(id => ownedProductIds.includes(id));
  fallback.blocks = fallback.blocks.map(b => {
    const composition = variants.get(b.type) ?? sectionCompositions(b.type)[0];
    // Legacy skeleton repair alternates band widths. Registered compositions own their width:
    // a full-bleed gallery following a full-bleed hero must stay full bleed.
    const width = sketchComponent(b.type, composition)?.defaultWidth;
    const { width: _previousWidth, ...content } = b;
    return { ...content, composition, ...(width && width !== 'bleed' ? { width } : {}), ...(b.type === 'catalog' ? { productRefs: (plannedProducts?.length ? [...new Set(plannedProducts)] : ownedProductIds).slice(0, 60) } : {}) };
  });
  const design: WebsiteDesignSpec = {
    schemaVersion: 1, promptVersion: DESIGN_PROMPT_VERSION, designSeed: input.designSeed, brand, artDirection: plan.artDirection,
    theme: tokensForSketch(fallback), pages: [], globalSections: { navigation: plan.navigation, footerId: '' }, assetAssignments: [],
    responsiveStrategy: { mobile: 600, tablet: 900, overlapOnMobile: false, respectReducedMotion: true }, quality: emptyQuality(), generation: { mode, stages: ['brand_analysis', 'art_direction', 'page_structure', 'content', 'asset_assignment', 'validation'] },
  };
  design.theme.typography.displayScale = plan.displayScale;
  design.theme.typography.bodyScale = plan.bodyScale;
  design.theme.spacing.section = plan.artDirection.layoutDensity === 'airy' ? 6 : plan.artDirection.layoutDensity === 'dense' ? 3 : 4;
  design.theme.imageStyles.fit = plan.artDirection.imageTreatment;
  const logo = input.assets.find(a => a.role === 'logo');
  if (logo) design.assetAssignments.push({ assetId: logo.path, role: 'logo', pageId: 'home', sectionId: 'navigation', field: 'logo', cropStrategy: 'contain', focalPoint: { x: 50, y: 50 }, alt: input.store.name });
  const baseDna = defaultDna(input.designSeed);
  const grammar = /brutal|record-shop/i.test(input.prompt) ? 'brutalist' : /magazine|revista/i.test(input.prompt) ? 'magazine' : plan.artDirection.composition === 'asymmetric' ? 'collage' : plan.artDirection.composition === 'grid' ? 'grid' : 'editorial';
  fallback.dna = normalizeDna(plan.dna ?? { ...baseDna,
    type: { ...baseDna.type, display: fallback.fonts.display, text: fallback.fonts.text },
    layout: { grammar, density: plan.artDirection.layoutDensity },
    shape: { radius: plan.artDirection.cornerStyle === 'square' ? 'none' : 'soft', border: grammar === 'brutalist' ? 'bold' : 'hairline', frame: plan.artDirection.imageTreatment === 'contain' ? 'inset' : 'bleed' },
    buttons: { form: grammar === 'brutalist' ? 'block' : plan.navigation === 'minimal' ? 'underline' : 'outline', hover: 'invert', press: 'none' },
    motion: { personality: plan.artDirection.motionLevel === 'expressive' ? 'playful' : 'calm' },
    surfaces: { ...baseDna.surfaces, cart: 'drawer', added: 'toast', product: fallback.product.layout, card: 'still', review: 'split' },
  }, input.designSeed).dna;
  // Fonts remain editable in one place; DNA records the same typography.
  fallback.dna.type.display = plan.fonts.display as typeof fallback.dna.type.display;
  fallback.dna.type.text = plan.fonts.text as typeof fallback.dna.type.text;
  fallback.style.buttons = sketchButtonStyle(fallback.dna.buttons.form);
  fallback.design = design;
  // Spend available images intentionally; never fill every slot with the first image.
  const images = input.assets.map(a => ({ ...a, role: sketchImageRole(a) })).filter(a => !['logo', 'reference', 'unused'].includes(a.role ?? ''));
  const claimed = new Set<string>();
  fallback.blocks = fallback.blocks.map((block, index) => {
    if (!['hero', 'story', 'split', 'gallery', 'collections', 'newsletter'].includes(block.type)) return block;
    if (block.type === 'hero' && ['statement', 'poster', 'massive-type'].includes(block.composition || '')) return { ...block, photo: undefined, photos: [] };
    if (block.type === 'story' && ['manifesto', 'quote', 'oversized-quote', 'chapters'].includes(block.composition || '')) return { ...block, photo: undefined };
    if (block.type === 'collections' && ['editorial-index', 'large-type-links'].includes(block.composition || '')) return { ...block, items: block.items.map(item => ({ ...item, photo: undefined })) };
    const metadata = sketchComponent(block.type, block.composition);
    const preferProduct = !!metadata?.needs.productImage || (block.type === 'hero' && /floating|collage/.test(block.composition || '') && plan.artDirection.imageTreatment === 'contain');
    const available = images.filter(a => !claimed.has(a.path) && (preferProduct ? isProductImage(a.role) : isSceneImage(a.role) || a.role === 'product-detail' || a.role === 'portrait' || a.role === 'decorative')).sort((a, b) => Number(preferProduct ? isProductImage(b.role) : isSceneImage(b.role)) - Number(preferProduct ? isProductImage(a.role) : isSceneImage(a.role)));
    if (block.type === 'hero' && /floating|collage/.test(block.composition || '')) {
      // Two strong images earn the composition and leave photography for later storytelling.
      const selected = available.slice(0, 2); selected.forEach(a => claimed.add(a.path));
      if (selected.length < 2) return { ...block, composition: selected.length ? 'editorial-split' : 'massive-type', photo: selected[0]?.path, photos: [] };
      return { ...block, photo: selected[0].path, photos: selected.slice(1).map(a => a.path) };
    }
    if (block.type === 'gallery') {
      const selected = block.photos.map(path => available.find(a => a.path === path)).filter((a): a is typeof available[number] => !!a);
      const choices = selected.length >= (metadata?.needs.images ?? 1) ? selected : [...selected, ...available.filter(a => !selected.includes(a))];
      const reserved = fallback.blocks.slice(index + 1).reduce((count, next) => count + (sketchComponent(next.type, next.composition)?.needs.images ?? 0), 0);
      const limit = ['full-bleed', 'bleed'].includes(block.composition || '') ? 1 : Math.min(4, Math.max(metadata?.needs.images ?? 1, available.length - reserved));
      const photos = choices.slice(0, limit).map(a => a.path);
      photos.forEach(p => claimed.add(p));
      return { ...block, photos };
    }
    if (block.type === 'collections') return { ...block, items: block.items.map(item => { const asset = available.shift(); if (!asset) return { ...item, photo: undefined }; claimed.add(asset.path); return { ...item, photo: asset.path }; }) };
    const assigned = 'photo' in block && block.photo ? available.find(a => a.path === block.photo) : undefined;
    const asset = assigned ?? available[0];
    if (!asset) return { ...block, ...(block.type === 'hero' ? { composition: 'massive-type' } : {}), photo: undefined };
    claimed.add(asset.path);
    return { ...block, photo: asset.path, ...(block.type === 'hero' ? { photos: [] } : {}), imageFit: block.composition === 'product' || asset.role === 'product' || asset.role === 'packaging' ? 'contain' as const : plan.artDirection.imageTreatment };
  });
  fallback.design = syncDesignSpec(design, fallback, { storeName: input.store.name, purpose: input.purpose, photos: input.assets.map(a => a.path) });
  for (const a of fallback.design?.assetAssignments ?? []) {
    const source = images.find(asset => asset.path === a.assetId);
    if (source && ['product', 'lifestyle', 'portrait', 'background', 'detail', 'packaging', 'decorative', 'hero-lifestyle', 'product-detail', 'brand-editorial', 'location'].includes(source.role ?? '')) a.role = source.role as typeof a.role;
    if (source && ['product', 'packaging'].includes(source.role || '') && !fallback.blocks.find(b => b.id === a.sectionId)?.imageFit) a.cropStrategy = 'contain';
    a.alt = source?.description?.slice(0, 300) || a.alt;
  }
  return validateDesign(fallback, { storeName: input.store.name, purpose: input.purpose, photos: input.assets.map(a => a.path) }).sketch;
}
export function emptyQuality(): DesignQuality {
  return { scores: { hierarchy: 10, consistency: 10, brandFit: 8, imageUsage: 10, contentCompleteness: 10, sectionVariety: 10, ecommerceClarity: 10, mobileSafety: 9, accessibility: 9, visualRhythm: 10 }, findings: [] };
}
/** Scores measure detectable conditions, not an AI promise of visual quality. Only new generation
 * runs repairs; edits can request a report without changing merchant composition. */
export function validateDesign(input: StoreSketch, ctx: SketchContext, repair = true): { sketch: StoreSketch; quality: DesignQuality } {
  const sketch = structuredClone(input), quality = emptyQuality();
  const find = (code: string, sectionId?: string, repaired = false) => quality.findings.push({ code, ...(sectionId ? { sectionId } : {}), severity: 'warning', repaired });
  const headings = new Set<string>(), imageUses = new Map<string, number>();
  sketch.blocks.forEach((block, i) => {
    const heading = 'headline' in block ? block.headline : 'title' in block ? block.title : '';
    if (heading && headings.has(heading.toLowerCase())) { find('duplicate-heading', block.id); quality.scores.contentCompleteness -= 1; }
    headings.add(heading.toLowerCase());
    if ('cta' in block && !block.cta.trim()) { if (repair) block.cta = ctx.purpose === 'shop' ? 'Ver productos' : 'Conocer más'; find('empty-cta', block.id, repair); quality.scores.ecommerceClarity -= repair ? 0 : 2; }
    if (contrastRatio(resolveBg(sketch.palette, block.bg), bestInkFor(resolveBg(sketch.palette, block.bg), sketch.palette.ink)) < 4.5) { find('text-contrast', block.id); quality.scores.accessibility -= 3; }
    if (i > 0 && block.bg === sketch.blocks[i - 1].bg) { find('repeated-background', block.id); quality.scores.visualRhythm -= 0.5; }
    if (i > 0 && block.type === sketch.blocks[i - 1].type && block.composition === sketch.blocks[i - 1].composition) { find('repeated-composition', block.id); quality.scores.sectionVariety -= 2; }
    if ('photo' in block && block.photo) imageUses.set(block.photo, (imageUses.get(block.photo) ?? 0) + 1);
    if ('photos' in block) block.photos?.forEach(p => imageUses.set(p, (imageUses.get(p) ?? 0) + 1));
    if (block.composition === 'immersive' && (!('photo' in block) || !block.photo)) { if (repair) block.composition = 'statement'; find('immersive-without-image', block.id, repair); }
    const entry = sketchComponent(block.type, block.composition);
    const images = block.type === 'hero' ? (block.photo ? 1 : 0) + (/collage|floating/.test(block.composition || '') ? block.photos?.length || 0 : 0)
      : block.type === 'gallery' ? block.photos.length : block.type === 'collections' ? block.items.filter(item => item.photo).length : 'photo' in block && block.photo ? 1 : 0;
    if (entry && entry.renderer !== 'legacy' && entry.needs.images > images) {
      find('composition-missing-images', block.id, repair); quality.scores.imageUsage -= repair ? 0 : 2;
      if (repair) {
        block.composition = block.type === 'hero' ? (images ? 'editorial-split' : 'massive-type') : block.type === 'gallery' ? 'full-bleed' : block.type === 'collections' ? 'large-type-links' : 'manifesto';
        const width = sketchComponent(block.type, block.composition)?.defaultWidth;
        if (width && width !== 'bleed') block.width = width; else delete block.width;
      }
    }
    if (block.type === 'gallery' && !block.photos.length) { find('empty-gallery', block.id, repair); }
  });
  if (repair) sketch.blocks = sketch.blocks.filter(b => b.type !== 'gallery' || b.photos.length);
  for (const count of imageUses.values()) if (count > 2) { find('repeated-image'); quality.scores.imageUsage -= count - 2; }
  if (ctx.photos.length && !imageUses.size) { find('unused-images'); quality.scores.imageUsage = 3; }
  if (!sketch.blocks.some(b => b.type === 'hero')) { find('missing-hero'); quality.scores.hierarchy = 4; }
  if (sketch.blocks.filter(b => b.align === 'center').length > sketch.blocks.length / 2) { find('too-many-centered-sections'); quality.scores.visualRhythm -= 2; }
  const widths = new Set(sketch.blocks.map(b => b.width ?? 'bleed'));
  if (widths.size === 1 && sketch.blocks.length > 4) { find('uniform-width'); quality.scores.visualRhythm -= 1; }
  if (ctx.purpose === 'shop' && !sketch.blocks.some(b => b.type === 'catalog')) { find('missing-catalog'); quality.scores.ecommerceClarity = 0; }
  for (const key of Object.keys(quality.scores) as Array<keyof DesignQuality['scores']>) quality.scores[key] = Math.max(0, quality.scores[key]);
  if (sketch.design) { sketch.design.quality = quality; sketch.design = syncDesignSpec(sketch.design, sketch, ctx); }
  return { sketch, quality };
}

/** Model-free regeneration changes only composition, keeps every merchant field, product binding
 * and asset, and saves through the same optimistic revision path as any Boceto edit. */
export function regenerateSketch(input: StoreSketch, ctx: SketchContext, seed: string, sectionId?: string): StoreSketch {
  const sketch = structuredClone(input), random = seededRandom(seed);
  sketch.blocks = sketch.blocks.map((block, i) => {
    if (sectionId && block.id !== sectionId) return block;
    const requirements = sourceSketchCompositionCandidates({ style: sketch.design?.artDirection.style, density: sketch.design?.artDirection.layoutDensity, text: sketch.design?.brand.businessType || '', catalogItems: Math.max(0, ...sketch.blocks.map(b => b.productRefs?.length || 0)), assets: ctx.photos.map(path => ({ role: sketch.design?.assetAssignments.find(a => a.assetId === path)?.role || 'lifestyle' })), newsletterEnabled: sketch.blocks.some(b => b.type === 'newsletter') });
    const visibleImages = [('photo' in block && block.photo) || '', ...('photos' in block ? block.photos ?? [] : [])].filter(Boolean);
    const compatible = requirements.filter(entry => entry.type === block.type && entry.fit.eligible && (block.type !== 'hero' || entry.needs.images <= visibleImages.length)).map(entry => entry.variant);
    const choices = sectionCompositions(block.type).filter(value => compatible.includes(value) && value !== block.composition && !(['immersive', 'product'].includes(value) && !('photo' in block && block.photo))); 
    const composition = choices[Math.floor(random() * choices.length)] ?? block.composition;
    return { ...block, composition, ...(sectionId ? {} : { width: sketchComponent(block.type, composition)?.defaultWidth ?? (i % 2 ? 'wide' as const : 'bleed' as const) }) };
  });
  if (!sectionId) {
    const opening = sketch.blocks.filter(b => b.type === 'hero' || b.type === 'announce');
    const body = sketch.blocks.filter(b => !['hero', 'announce', 'footer'].includes(b.type));
    for (let i = body.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [body[i], body[j]] = [body[j], body[i]]; }
    sketch.blocks = [...opening, ...body, ...sketch.blocks.filter(b => b.type === 'footer')];
  }
  if (sketch.design) { sketch.design.designSeed = seed; sketch.design = syncDesignSpec(sketch.design, sketch, ctx); }
  return validateDesign(sketch, ctx, false).sketch;
}
