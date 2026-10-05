import { SKETCH_REGISTRY_CSS } from '../sketch/sketch-registry-css';
import { tokensForSketch } from './design-document';
import type { StoreSketch } from '../sketch/sketch-schema';
export function designTokenCss(sketch: StoreSketch): string {
  if (!sketch.design && !sketch.blocks.some(block => block.composition)) return '';
  const t = sketch.design?.theme ?? tokensForSketch(sketch);
  return `:root {
    --yapi-display: ${t.typography.displayScale}rem; --yapi-heading: ${t.typography.headingScale}rem;
    --yapi-body: ${t.typography.bodyScale}rem; --yapi-tracking: ${t.typography.letterSpacing}em;
    --yapi-leading: ${t.typography.lineHeight}; --yapi-unit: ${t.spacing.unit}rem;
    --yapi-section: ${t.spacing.section}rem; --yapi-gutter: ${t.spacing.gutter}rem;
    --yapi-wide: ${t.containerWidths.wide}rem; --yapi-narrow: ${t.containerWidths.narrow}rem;
    --yapi-card-radius: ${t.radius.card}rem; --yapi-button-radius: ${t.radius.button}rem;
    --yapi-fit: ${t.imageStyles.fit}; --store-radius: ${t.radius.button}rem;
  }\n${DESIGN_COMPOSITION_CSS}\n${SKETCH_REGISTRY_CSS}`;
}
/** Geometry belongs to registered compositions; no model-generated CSS is needed. Rules are
 * opt-in via data-yapi-design, so old bocetos retain their historical appearance. */
export const DESIGN_COMPOSITION_CSS = `
.skb-site[data-yapi-design] { font-size: var(--yapi-body); line-height: var(--yapi-leading); overflow-wrap: anywhere; }
.skb-site[data-yapi-design] *, .skb-site[data-yapi-design] *::before, .skb-site[data-yapi-design] *::after { box-sizing: border-box; }
.skb-site[data-yapi-design] .skb { min-width: 0; padding-inline: clamp(1rem, 4vw, var(--yapi-gutter)); }
.skb-site[data-yapi-design] .skb > * { min-width: 0; }
.skb-site[data-yapi-design] .skb--s { padding-block: calc(var(--yapi-section) * .4); }
.skb-site[data-yapi-design] .skb--m { padding-block: clamp(2rem, 5vw, var(--yapi-section)); }
.skb-site[data-yapi-design] .skb--l { padding-block: clamp(3rem, 7vw, calc(var(--yapi-section) * 1.5)); }
.skb-site[data-yapi-design] .skb--xl { padding-block: clamp(3.5rem, 8vw, calc(var(--yapi-section) * 1.8)); }
.skb-site[data-yapi-design] .skb-display { font-size: clamp(2.4rem, 8.5vw, var(--yapi-display)); letter-spacing: var(--yapi-tracking); line-height: .96; max-width: 15ch; }
.skb-site[data-yapi-design] .skb-title { font-size: clamp(1.7rem, 4.8vw, var(--yapi-heading)); letter-spacing: var(--yapi-tracking); }
.skb-site[data-yapi-design] .skb-lead { font-size: var(--yapi-body); line-height: var(--yapi-leading); }
.skb-site[data-yapi-design] .skb-kicker::before { content: none; }
.skb-site[data-yapi-design] .skb-btn, .skb-site[data-yapi-design] .skb-cart { border-radius: var(--yapi-button-radius); min-height: 44px; }
.skb-site[data-yapi-design] img { max-width: 100%; }
.skb-site[data-yapi-design] .skb-logo img { width: auto; max-width: 180px; max-height: 54px; object-fit: contain; }
.skb-site[data-yapi-design] :is(a, button, summary, input):focus-visible { outline: 3px solid currentColor; outline-offset: 5px; }
.skb-site[data-yapi-design] .skb-card { background: var(--skb-bg); color: var(--skb-ink); border-radius: var(--yapi-card-radius); }
.skb-site[data-yapi-design] .skb-card__body { padding: 1rem 0; }
.skb-site[data-yapi-design] .skb-card__add { border-radius: var(--yapi-button-radius); min-height: 44px; }
.skb-site[data-yapi-design] .skb-card__media img { object-fit: var(--yapi-fit); border-radius: var(--yapi-card-radius); }
.skb-site[data-yapi-design] [data-skb-width="wide"] > :not(.skb-extras) { max-width: var(--yapi-wide); }
.skb-site[data-yapi-design] [data-skb-width="narrow"] > :not(.skb-extras) { max-width: var(--yapi-narrow); }
.skb-site[data-yapi-design] .skb-menu { display: none; }
.skb-site[data-yapi-nav="transparent"] .skb-header { position: absolute; inset: 0 0 auto; z-index: 5; background: rgba(0,0,0,.85); color: white; }
.skb-site[data-yapi-design] .skb-skip { position: absolute; top: -200px; z-index: 20; background: var(--skb-paper); color: var(--skb-page-ink); padding: 1rem; }
.skb-site[data-yapi-design] .skb-skip:focus { top: 0; }
.skb-hero[data-skb-composition="product"] .skb-hero__img { object-fit: contain; aspect-ratio: 1 / 1; max-height: 70svh; }
.skb-hero[data-skb-composition="poster"] { display: block; min-height: auto; border-block: 2px solid currentColor; }
.skb-hero[data-skb-composition="poster"] .skb-hero__media { display: none; }
.skb-hero[data-skb-composition="poster"] .skb-display { max-width: 22ch; font-size: clamp(3rem, 12vw, var(--yapi-display)); text-transform: uppercase; }
.skb-story[data-skb-composition="chapters"] .skb-story__paragraphs { display: grid; gap: 2rem; counter-reset: chapter; }
.skb-story[data-skb-composition="chapters"] .skb-story__paragraphs p { counter-increment: chapter; border-top: 1px solid currentColor; padding-top: 1rem; }
.skb-story[data-skb-composition="chapters"] .skb-story__paragraphs p::before { content: counter(chapter, decimal-leading-zero); display: block; margin-bottom: .5rem; font-family: var(--skb-display-font); font-size: 2rem; }
.skb-catalog[data-skb-composition="dense-grid"] .skb-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.skb-catalog[data-skb-composition="dense-grid"] .skb-card__body { padding: .75rem 0; }
.skb-footer[data-skb-composition="editorial"] .skb-footer__grid { grid-template-columns: 1fr; gap: 2rem; border-top: 1px solid currentColor; padding-top: 2rem; }
.skb-footer[data-skb-composition="editorial"] .skb-wordmark { text-align: left; font-size: clamp(2rem, 9vw, 8rem); }
/* Hero compositions maintain the same selectable copy/media groups. */
.skb-hero[data-skb-composition="statement"] { display: block; }
.skb-hero[data-skb-composition="statement"] .skb-hero__media { display: none; }
.skb-hero[data-skb-composition="statement"] .skb-display { max-width: 18ch; font-size: clamp(2.5rem, 11vw, var(--yapi-display)); }
.skb-hero[data-skb-composition="immersive"] { display: grid; grid-template-columns: 1fr; min-height: min(900px, 88svh); padding: 0; isolation: isolate; }
.skb-hero[data-skb-composition="immersive"] > .skb-hero__media { position: absolute; inset: 0; z-index: -2; margin: 0; max-width: none; }
.skb-hero[data-skb-composition="immersive"] .skb-hero__img { width: 100%; height: 100%; object-fit: cover; border-radius: 0; }
.skb-hero[data-skb-composition="immersive"]::after { content: ''; position: absolute; inset: 0; z-index: -1; background: rgba(0,0,0,.6); }
.skb-hero[data-skb-composition="immersive"] > .skb-hero__copy { color: white; padding: clamp(2rem, 6vw, 6rem); align-self: end; max-width: 65rem; }
.skb-hero[data-skb-composition="immersive"] .skb-btn { background: white; color: #111; }
.skb-hero[data-skb-composition="immersive"] .skb-btn--ghost { background: transparent; color: white; border-color: white; }
.skb-story[data-skb-composition="manifesto"], .skb-story[data-skb-composition="quote"] { grid-template-columns: 1fr; }
.skb-story[data-skb-composition="manifesto"] .skb-title { max-width: 18ch; font-size: clamp(2.5rem, 7vw, var(--yapi-display)); }
.skb-story[data-skb-composition="quote"] .skb-title { max-width: 24ch; font-size: clamp(2rem, 5.8vw, var(--yapi-display)); font-style: italic; }
.skb-story[data-skb-composition="manifesto"] .skb-story__media, .skb-story[data-skb-composition="quote"] .skb-story__media { max-width: 34rem; margin-inline-start: auto; }
.skb-gallery[data-skb-composition="mosaic"] .skb-gallery__grid, .skb-gallery[data-skb-composition="collage"] .skb-gallery__grid { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: visible; }
.skb-gallery[data-skb-composition="bleed"] { padding-inline: 0; }
.skb-gallery[data-skb-composition="bleed"] .skb-head { padding-inline: var(--yapi-gutter); }
.skb-gallery[data-skb-composition="bleed"] .skb-gallery__grid { grid-auto-columns: 100%; gap: 0; scroll-snap-type: x mandatory; }
.skb-gallery[data-skb-composition="bleed"] .skb-gallery__img { aspect-ratio: 16 / 9; border-radius: 0; scroll-snap-align: start; }
/* Catalog variants style the live commerce mount; prices, stock and variants stay runtime-owned. */
.skb-catalog[data-skb-composition="rail"] .skb-list, .skb-collections[data-skb-composition="rail"] .skb-collections__grid { display: grid; grid-auto-flow: column; grid-template-columns: none; grid-auto-columns: minmax(260px, 32%); gap: 1.5rem; overflow-x: auto; padding-block: 1rem; scroll-snap-type: x mandatory; }
.skb-catalog[data-skb-composition="rail"] .skb-list > *, .skb-collections[data-skb-composition="rail"] .skb-collections__grid > * { scroll-snap-align: start; }
.skb-catalog[data-skb-composition="oversized"] .skb-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2rem; }
.skb-catalog[data-skb-composition="feature"] .skb-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.skb-catalog[data-skb-composition="feature"] .skb-card:first-child { grid-column: 1 / -1; display: grid; grid-template-columns: 1.25fr 1fr; align-items: center; }
.skb-catalog[data-skb-composition="feature"] .skb-card:first-child .skb-card__body { padding: clamp(1rem, 3vw, 3rem); }
.skb-catalog[data-skb-composition="alternating"] .skb-list { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 3rem; }
.skb-catalog[data-skb-composition="alternating"] .skb-card:nth-child(even) { margin-top: 4rem; }
.skb-steps[data-skb-composition="list"] .skb-steps__grid { grid-template-columns: 1fr; }
.skb-steps[data-skb-composition="list"] .skb-step { display: grid; grid-template-columns: 5rem 1fr 2fr; gap: 1rem; border-top: 1px solid currentColor; padding-block: 1.5rem; }
.skb-reviews[data-skb-composition="quote"] .skb-reviews__grid { grid-template-columns: 1fr; }
.skb-reviews[data-skb-composition="quote"] blockquote { font-family: var(--skb-display-font); font-size: clamp(1.5rem, 4vw, 3rem); }
.skb-footer[data-skb-composition="minimal"] .skb-footer__grid { display: flex; flex-wrap: wrap; justify-content: space-between; }
.skb-footer[data-skb-composition="minimal"] .skb-wordmark { display: none; }
.skb-footer[data-skb-composition="statement"] .skb-wordmark { font-size: clamp(3rem, 15vw, 18rem); line-height: 1; overflow-wrap: anywhere; }
@media (min-width: 900px) {
  .skb-hero[data-skb-composition="product"] { grid-template-columns: .8fr 1.4fr; align-items: center; }
  .skb-catalog[data-skb-composition="dense-grid"] .skb-list { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .skb-footer[data-skb-composition="editorial"] .skb-footer__grid { grid-template-columns: 2fr 1fr 1fr; }

  .skb-hero[data-skb-composition="editorial"] { grid-template-columns: 1.4fr .8fr; align-items: end; }
  .skb-hero[data-skb-composition="editorial"] .skb-hero__media { padding-bottom: 4rem; }
  .skb-hero[data-skb-composition="editorial"] .skb-hero__img { aspect-ratio: 3 / 4; object-fit: var(--yapi-fit); }
  .skb-hero[data-skb-composition="overlap"], .skb-split[data-skb-composition="overlap"] { grid-template-columns: 1.1fr 1fr; }
  .skb-hero[data-skb-composition="overlap"] .skb-hero__copy, .skb-split[data-skb-composition="overlap"] .skb-split__copy { z-index: 1; background: var(--skb-bg); padding: 2rem; margin-right: -4rem; }
  .skb-hero[data-skb-composition="offset"], .skb-split[data-skb-composition="offset"] { grid-template-columns: .85fr 1.2fr; align-items: start; }
  .skb-hero[data-skb-composition="offset"] .skb-hero__media, .skb-split[data-skb-composition="offset"] .skb-split__media { margin-top: 6rem; }
  .skb-story[data-skb-composition="article"] { grid-template-columns: 1.5fr .7fr; align-items: start; }
  .skb-story[data-skb-composition="article"] .skb-story__paragraphs { columns: 2; column-gap: 2rem; }
  .skb-story[data-skb-composition="article"] .skb-story__paragraphs > p { break-inside: avoid; }
  .skb-gallery[data-skb-composition="mosaic"] .skb-gallery__grid { grid-template-columns: 1.6fr 1fr 1fr; align-items: start; }
  .skb-gallery[data-skb-composition="mosaic"] .skb-gallery__img:first-child { grid-row: span 2; aspect-ratio: 3 / 4; }
  .skb-gallery[data-skb-composition="collage"] .skb-gallery__grid { grid-template-columns: 1fr 1.3fr 1fr; align-items: center; gap: 2rem; }
  .skb-gallery[data-skb-composition="collage"] .skb-gallery__img:nth-child(even) { transform: rotate(4deg); }
  .skb-collections[data-skb-composition="spotlight"] .skb-collections__grid { grid-template-columns: 1.6fr 1fr; }
  .skb-collections[data-skb-composition="spotlight"] .skb-collection:first-child { grid-row: span 2; }
  .skb-banner[data-skb-composition="offset"] { text-align: left; justify-items: start; }
  .skb-site[data-yapi-nav="editorial"] .skb-header { border-bottom: 2px solid currentColor; }
}
@media (min-width: 600px) and (max-width: 899px) {
  .skb-site[data-yapi-design] .skb-display { font-size: clamp(3rem, 9vw, 6rem); }
  .skb-site[data-yapi-design] .skb-gallery__grid { grid-auto-columns: 45%; }
}
@media (max-width: 899px) {
  .skb-site[data-yapi-design] .skb-header { display: flex; flex-wrap: wrap; padding: 1rem; gap: .8rem; }
  .skb-site[data-yapi-design] .skb-nav { display: none; }
  .skb-site[data-yapi-design] .skb-menu { display: block; position: relative; }
  .skb-menu summary { cursor: pointer; min-height: 44px; padding: .6rem; }
  .skb-menu[open] nav { position: absolute; top: 100%; right: 0; width: 240px; background: var(--skb-paper); color: var(--skb-page-ink); z-index: 10; border: 1px solid currentColor; padding: 1rem; display: grid; gap: .8rem; }
  .skb-menu nav a { color: inherit; min-height: 44px; display: flex; align-items: center; }
  .skb-site[data-yapi-design] .skb-header__actions { margin-left: auto; gap: .8rem; }
  .skb-site[data-yapi-design] .skb-account { display: none; }
  .skb-site[data-yapi-design] :is(.skb-hero, .skb-story, .skb-split) { grid-template-columns: minmax(0, 1fr); }
  .skb-site[data-yapi-design] :is(.skb-hero__copy, .skb-split__copy) { margin: 0; }
  .skb-site[data-yapi-design] .skb-hero__img { max-height: 65svh; width: 100%; object-fit: var(--yapi-fit); }
  .skb-site[data-yapi-design] .skb-hero[data-skb-composition="immersive"] .skb-hero__img { max-height: none; height: 100%; object-fit: cover; }
  .skb-site[data-yapi-design] .skb-hero[data-skb-composition="immersive"] { min-height: 75svh; }
  .skb-site[data-yapi-design] .skb-hero[data-skb-composition="immersive"] > .skb-hero__copy { padding: 2rem 1rem; }
  .skb-catalog[data-skb-composition="alternating"] .skb-card:nth-child(even) { margin-top: 0; }
  .skb-steps[data-skb-composition="list"] .skb-step { grid-template-columns: 1fr; }
}
@media (max-width: 599px) {
  .skb-catalog[data-skb-composition="oversized"] .skb-list, .skb-catalog[data-skb-composition="alternating"] .skb-list, .skb-catalog[data-skb-composition="feature"] .skb-list { grid-template-columns: minmax(0, 1fr); gap: 1.5rem; }
  .skb-catalog[data-skb-composition="feature"] .skb-card:first-child { display: block; }
  .skb-site[data-yapi-design] .skb-gallery__grid { grid-auto-columns: 85%; }
  .skb-gallery[data-skb-composition="bleed"] .skb-gallery__grid { grid-auto-columns: 100%; }
  .skb-gallery[data-skb-composition="mosaic"] .skb-gallery__grid, .skb-gallery[data-skb-composition="collage"] .skb-gallery__grid { grid-template-columns: 1fr; }
  .skb-site[data-yapi-design] .skb-wordmark { font-size: clamp(2rem, 13vw, 6rem); }
}
@media (prefers-reduced-motion: no-preference) {
  .skb-site[data-yapi-motion="subtle"] .skb-card__media img { transition: transform 260ms ease; }
  .skb-site[data-yapi-motion="subtle"] .skb-card__media:hover img { transform: scale(1.025); }
}
@media (prefers-reduced-motion: reduce) {
  .skb-site[data-yapi-design] *, .skb-site[data-yapi-design] *::before, .skb-site[data-yapi-design] *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
.skb-site[data-yapi-motion="none"] *, .skb-site[data-yapi-motion="none"] *::before, .skb-site[data-yapi-motion="none"] *::after { animation: none !important; transition: none !important; }
`;
