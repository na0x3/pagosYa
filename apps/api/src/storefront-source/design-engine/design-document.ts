import { z } from 'zod';
import { sectionCompositions, type WebsiteDesignSpec, type DesignTokens, type AssetAssignment } from '@pagosya/shared-types';
import { artDirectionSchema, brandDirectionSchema } from './design-schemas';
import type { StoreSketch, SketchContext } from '../sketch/sketch-schema';
const finite = (min: number, max: number) => z.number().finite().min(min).max(max);
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export const designTokensSchema = z.object({
  colors: z.object({ background: hex, foreground: hex, primary: hex, secondary: hex, accent: hex, muted: hex, border: hex }),
  typography: z.object({ displayFont: z.string(), headingFont: z.string(), bodyFont: z.string(), displayScale: finite(4, 10), headingScale: finite(2, 5), bodyScale: finite(1, 1.25), letterSpacing: finite(-0.05, 0.1), lineHeight: finite(1.3, 2) }),
  spacing: z.object({ unit: finite(0.2, 1), section: finite(2, 8), gutter: finite(1, 5) }),
  radius: z.object({ card: finite(0, 3), button: finite(0, 999) }), shadows: z.object({ elevation: z.enum(['none', 'soft', 'hard']) }),
  containerWidths: z.object({ wide: finite(60, 100), narrow: finite(32, 60) }),
  buttonStyles: z.object({ treatment: z.string().max(30) }), imageStyles: z.object({ fit: z.enum(['cover', 'contain']), ratio: z.enum(['4-3', '1-1', '3-4']) }),
});
const assignmentSchema = z.object({ assetId: z.string().max(200), role: z.enum(['logo', 'product', 'lifestyle', 'portrait', 'background', 'detail', 'packaging', 'decorative', 'hero-lifestyle', 'product-detail', 'brand-editorial', 'location']), pageId: z.string().max(80), sectionId: z.string().max(80), field: z.string().max(80), cropStrategy: z.enum(['cover', 'contain']), focalPoint: z.object({ x: finite(0, 100), y: finite(0, 100) }), alt: z.string().max(300) });
const score = finite(0, 10);
const scoresSchema = z.object({ hierarchy: score, consistency: score, brandFit: score, imageUsage: score, contentCompleteness: score, sectionVariety: score, ecommerceClarity: score, mobileSafety: score, accessibility: score, visualRhythm: score });
export const websiteDesignSpecSchema: z.ZodType<WebsiteDesignSpec> = z.object({
  schemaVersion: z.literal(1), promptVersion: z.string().max(80), designSeed: z.string().min(1).max(160), brand: brandDirectionSchema, artDirection: artDirectionSchema, theme: designTokensSchema,
  pages: z.array(z.object({ id: z.string(), slug: z.string(), pageType: z.enum(['home', 'product', 'checkout']), sections: z.array(z.object({ id: z.string(), type: z.enum(['hero', 'catalog', 'story', 'split', 'gallery', 'collections', 'steps', 'reviews', 'banner', 'newsletter', 'footer', 'announce', 'marquee', 'faq']), variant: z.string(), content: z.record(z.unknown()), layout: z.object({ width: z.string(), alignment: z.string(), mobile: z.enum(['stack', 'rail']), tablet: z.enum(['stack', 'grid']) }), productRefs: z.array(z.string()), assetRefs: z.array(z.string()) })).max(20) })).max(3),
  globalSections: z.object({ navigation: z.enum(['minimal', 'editorial', 'centered', 'transparent']), footerId: z.string() }),
  assetAssignments: z.array(assignmentSchema).max(100),
  responsiveStrategy: z.object({ mobile: z.literal(600), tablet: z.literal(900), overlapOnMobile: z.literal(false), respectReducedMotion: z.literal(true) }),
  quality: z.object({ scores: scoresSchema, findings: z.array(z.object({ code: z.string().max(100), sectionId: z.string().optional(), severity: z.enum(['warning', 'error']), repaired: z.boolean() })).max(100) }),
  generation: z.object({ mode: z.enum(['ai', 'fallback']), stages: z.array(z.string().max(80)).max(20) }),
});

export function tokensForSketch(sketch: StoreSketch, previous?: DesignTokens): DesignTokens {
  const p = sketch.palette, airy = sketch.design?.artDirection.layoutDensity === 'airy';
  return {
    colors: { background: p.paper, foreground: p.ink, primary: p.accent, secondary: p.deep, accent: p.pop, muted: p.paper, border: p.ink },
    typography: { displayFont: sketch.fonts.display, headingFont: sketch.fonts.display, bodyFont: sketch.fonts.text,
      displayScale: previous?.typography.displayScale ?? 6.5, headingScale: previous?.typography.headingScale ?? 3.2, bodyScale: previous?.typography.bodyScale ?? 1,
      letterSpacing: previous?.typography.letterSpacing ?? -0.025, lineHeight: previous?.typography.lineHeight ?? 1.6 },
    spacing: previous?.spacing ?? { unit: 0.5, section: airy ? 6 : 4, gutter: 3 },
    radius: { card: sketch.style.radius === 'square' ? 0 : sketch.style.radius === 'soft' ? 0.4 : 1.5, button: sketch.style.buttons === 'pill' ? 999 : 0 },
    shadows: { elevation: sketch.style.buttons === 'hard-shadow' ? 'hard' : 'none' },
    containerWidths: previous?.containerWidths ?? { wide: 84, narrow: 44 }, buttonStyles: { treatment: sketch.style.buttons },
    imageStyles: { fit: sketch.design?.artDirection.imageTreatment ?? previous?.imageStyles.fit ?? 'cover', ratio: previous?.imageStyles.ratio ?? '3-4' },
  };
}

/** The editable blocks are authoritative. Rebuild the spec projection after every edit so no second
 * copy of content or tokens can silently diverge. Invalid metadata is discarded on legacy reads. */
export function syncDesignSpec(raw: unknown, sketch: StoreSketch, ctx: SketchContext): WebsiteDesignSpec | undefined {
  const parsed = websiteDesignSpecSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const design = parsed.data;
  const assignments: AssetAssignment[] = [];
  for (const block of sketch.blocks) {
    const media: Array<[string, string]> = [];
    if ('photo' in block && block.photo) media.push(['photo', block.photo]);
    if ('photos' in block) block.photos?.forEach((path, i) => media.push([`photos.${i}`, path]));
    if (block.type === 'collections') block.items.forEach((item, i) => { if (item.photo) media.push([`items.${i}.photo`, item.photo]); });
    for (const [field, path] of media) {
      const prior = design.assetAssignments.find(a => a.sectionId === block.id && a.field === field && a.assetId === path);
      assignments.push({ assetId: path, role: prior?.role ?? 'lifestyle', pageId: 'home', sectionId: block.id, field,
        cropStrategy: block.imageFit ?? prior?.cropStrategy ?? design.artDirection.imageTreatment,
        focalPoint: block.focalPoint ?? prior?.focalPoint ?? { x: 50, y: 50 }, alt: prior?.alt || `Imagen de ${ctx.storeName}` });
    }
  }
  const logo = design.assetAssignments.find(a => a.role === 'logo' && ctx.photos.includes(a.assetId));
  if (logo) assignments.push(logo);
  const home = { id: 'home', slug: '/', pageType: 'home' as const, sections: sketch.blocks.map(block => {
    const { id, type, composition, width, align, productRefs, ...content } = block;
    const assets = assignments.filter(a => a.sectionId === id);
    return { id, type, variant: composition ?? sectionCompositions(type)[0], content,
      layout: { width: width ?? 'bleed', alignment: align ?? 'start', mobile: /rail|strip/.test(composition || '') ? 'rail' as const : 'stack' as const, tablet: 'grid' as const },
      productRefs: productRefs ?? [], assetRefs: assets.map(a => a.assetId) };
  }) };
  return { ...design, theme: tokensForSketch(sketch, design.theme), pages: [home, ...(ctx.purpose === 'shop' ? [{ id: 'product', slug: '/product.html', pageType: 'product' as const, sections: [] }, { id: 'checkout', slug: '/checkout.html', pageType: 'checkout' as const, sections: [] }] : [])],
    assetAssignments: assignments, globalSections: { ...design.globalSections, footerId: sketch.blocks.find(b => b.type === 'footer')?.id ?? '' } };
}
