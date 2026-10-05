import { sketchComponent } from '@pagosya/shared-types';
import type { SketchBlock, SketchContext, StoreSketch } from './sketch-schema';
import { sketchFreeAttributes } from './sketch-free';

const expression = (value: unknown) => `{${JSON.stringify(value)}}`;
const field = (name: string) => `data-skb-field=${expression(name)}`;
/** Existing markup is the content adapter: ordering, free positioning and editor markers
 * remain identical. The registry chooses only trusted composition functions. */
const inside = (markup: string) => markup.slice(markup.indexOf('>') + 1, markup.lastIndexOf('</section>'));
const beforeMedia = (markup: string, family: string) => {
  const content = inside(markup);
  const offsets = [`\n    <div className="skb-${family}__media`, `\n    <div className={"skb-${family}__media`].map(prefix => content.indexOf(prefix)).filter(index => index >= 0);
  const offset = offsets.length ? Math.min(...offsets) : -1;
  return offset < 0 ? content : content.slice(0, offset);
};
const image = (path: string, slot: string, block: SketchBlock, sketch: StoreSketch, ctx: SketchContext, key?: string) => {
  const assignment = sketch.design?.assetAssignments.find(a => a.sectionId === block.id && a.field === slot);
  const focal = block.focalPoint ?? assignment?.focalPoint;
  const nodePath = block.type === 'gallery' ? `items/${key}` : `media/${key ?? slot}`;
  const free = block.free?.[nodePath];
  return { src: path, alt: assignment?.alt || `Imagen de ${ctx.storeName}`, fit: block.imageFit ?? assignment?.cropStrategy ?? 'cover',
    ...(focal ? { position: `${focal.x}% ${focal.y}%` } : {}), sketchPhoto: slot, sketchNode: key ?? slot, ...(free ? { sketchFree: free } : {}) };
};
type Adapter = (block: SketchBlock, sketch: StoreSketch, ctx: SketchContext, legacy: string) => string;
const hero: Adapter = (block, sketch, ctx, legacy) => {
  if (block.type !== 'hero') return legacy;
  const renderer = sketchComponent(block.type, block.composition)!.renderer;
  const copy = beforeMedia(legacy, 'hero').replace('skb-hero__copy', renderer === 'hero-floating' || renderer === 'hero-collage' ? 'skb-hero__copy ui-floating__copy' : 'skb-hero__copy ui-hero__copy');
  const photo = block.photo ? image(block.photo, 'photo', block, sketch, ctx) : undefined;
  const images = [photo, ...(block.photos ?? []).map((path, i) => image(path, `photos.${i}`, block, sketch, ctx, `photos/${i}`))].filter(Boolean);
  if (renderer === 'hero-floating' || renderer === 'hero-collage')
    return `<FloatingMedia title="" copy={<>${copy}</>} images=${expression(images)} sketch mediaFree=${expression(block.free?.media)} motion={${sketch.dna?.motion.personality !== 'calm' && sketch.design?.artDirection.motionLevel !== 'none'}} />`;
  const variant = renderer === 'hero-bleed' ? 'fullbleed' : renderer === 'hero-type' || renderer === 'hero-poster' ? 'typographic' : renderer === 'hero-editorial' ? 'editorial' : 'split';
  const source = inside(legacy);
  const mediaOffset = source.indexOf('\n    <div className={"skb-hero__media');
  const media = photo && mediaOffset >= 0 ? source.slice(mediaOffset).replace(/className=\{"skb-hero__media[^}]*\}/, 'className="ui-hero__media"') : '';

  if (renderer === 'hero-cover') return `${copy}${media}`;
  return `<Hero title="" variant="${variant}" copy={<>${copy}</>} ${media && variant !== 'typographic' ? `media={${media}}` : ''} />`;
};
const catalog: Adapter = (block, _sketch, _ctx, legacy) => {
  if (block.type !== 'catalog') return legacy;
  const presentation = sketchComponent(block.type, block.composition)!.renderer.replace('catalog-', '');
  const heading = inside(legacy).split('\n    <template data-pagosya-product-template>')[0];
  const layout = presentation === 'rail' ? 'rail' : presentation === 'asymmetric' ? 'editorial' : 'grid';
  const component = presentation === 'rail' ? 'ProductRail' : 'Catalog';
  // Keep both fields mounted: Boceto's existing live flags can hide/show them without a new template.
  return `${heading}<${component} id="" ${component === 'Catalog' ? `layout="${layout}"` : ''} presentation="${presentation}" card="caption" columns={2} showDescription showAdd productIds=${expression(block.productRefs ?? [])} sketch fx="none" />`;
};
const story: Adapter = (block, sketch, ctx, legacy) => {
  if (block.type !== 'story') return legacy;
  const renderer = sketchComponent(block.type, block.composition)!.renderer;
  const heading = legacy.includes('<h1 ') ? 'h1' : 'h2';
  if (renderer === 'story-chapters') {
    const saved = (path: string) => sketchFreeAttributes(block.free?.[path]);
    const parts: Record<string, string> = {
      title: `<${heading} className="skb-title" data-skb-el="title" ${field('title')} ${saved('copy/title')}>${expression(block.title)}</${heading}>`,
      paragraphs: `<div className="skb-story__paragraphs" data-skb-group="paragraphs" ${saved('copy/paragraphs')}><StoryChapters chapters={[${block.paragraphs.map((p, i) => `{ eyebrow: ${JSON.stringify(String(i + 1).padStart(2, '0'))}, body: <span data-skb-node="${i}" ${field(`paragraphs.${i}`)} ${saved(`copy/paragraphs/${i}`)}>${expression(p)}</span> }`).join(',')}]} /></div>`,
    };
    const kicker = block.kicker ? `<p className="skb-kicker" data-skb-node="kicker" ${field('kicker')} ${saved('copy/kicker')}>${expression(block.kicker)}</p>` : '';
    return `<div className="skb-story__copy" data-skb-group="copy" ${saved('copy')}>${kicker}${(block.order ?? ['title', 'paragraphs']).map(key => parts[key] || '').join('')}</div>`;
  }
  if (renderer === 'story-split' && block.photo) return `<FeatureSplit image=${expression(image(block.photo, 'photo', block, sketch, ctx))} title="" copy={<>${beforeMedia(legacy, 'story')}</>} sketch mediaFree=${expression(block.free?.media)} reverse={${!!block.flip}} />`;
  let copy = beforeMedia(legacy, 'story');
  if (renderer === 'story-manifesto') {
    const marker = copy.indexOf('data-skb-field={"title"}');
    const at = copy.indexOf(expression(block.title), marker);
    if (at >= 0) copy = copy.slice(0, at) + `<Statement as="span">${expression(block.title)}</Statement>` + copy.slice(at + expression(block.title).length);
  }
  return renderer === 'story-quote' ? `<blockquote>${copy}</blockquote>` : copy;
};
const gallery: Adapter = (block, sketch, ctx, legacy) => {
  if (block.type !== 'gallery') return legacy;
  const renderer = sketchComponent(block.type, block.composition)!.renderer;
  const images = (renderer === 'gallery-bleed' ? block.photos.slice(0, 1) : block.photos).map((p, i) => image(p, `photos.${i}`, block, sketch, ctx, String(i)));
  const heading = inside(legacy).split('<div className="skb-gallery__grid"')[0];
  return `${heading}<div data-skb-group="items" ${sketchFreeAttributes(block.free?.items)}><Gallery images=${expression(images)} variant="${renderer === 'gallery-strip' ? 'strip' : renderer === 'gallery-bleed' ? 'grid' : 'mosaic'}" /></div>`;
};
const footer: Adapter = (block, _sketch, ctx, legacy) => {
  if (block.type !== 'footer') return legacy;
  const content = inside(legacy);
  const wordmark = block.wordmark === 'giant' ? `<p className="skb-wordmark" aria-hidden="true">${expression(ctx.storeName)}</p>` : '';
  if (block.composition === 'giant-wordmark') return `<p className="skb-wordmark" aria-hidden="true">${expression(ctx.storeName)}</p>` + content.replace(wordmark, '');
  return content.replace(wordmark, '');
};
/** Routing is derived from registry renderer ids, with a single handler per component family. */
const adapters: Record<string, Adapter> = { hero, catalog, story, gallery, footer, categories: (_b, _s, _c, legacy) => inside(legacy) };
export function renderSketchComposition(block: SketchBlock, sketch: StoreSketch, ctx: SketchContext, legacy: string): string {
  const entry = sketchComponent(block.type, block.composition);
  if (!entry || entry.renderer === 'legacy') return legacy;
  const adapter = adapters[entry.renderer.split('-')[0]];
  if (!adapter) throw new Error(`Sketch registry adapter missing: ${entry.id}`);
  // Root remains selectable by Boceto. No executable code comes from sketch.json.
  const end = legacy.indexOf('>') + 1;
  const opening = legacy.slice(0, end).replace(' className=', ` data-skb-renderer="${entry.renderer}" className=`);
  return (block.type === 'footer' ? opening.replace('<section ', '<footer ') : opening) + adapter(block, sketch, ctx, legacy) + (block.type === 'footer' ? '</footer>' : '</section>');
}
export const sketchUiImports = 'Hero, FloatingMedia, Catalog, ProductRail, FeatureSplit, StoryChapters, Gallery, Statement';
