/** Geometry for deterministic adapters. Shared ui-* primitives own their baseline responsive
 * behavior; these rules express the sketch's editorial hierarchy and token inheritance. */
export const SKETCH_REGISTRY_CSS = `
.skb-site .skb[data-skb-renderer]{display:block;min-height:0;--ui-paper:var(--skb-bg);--ui-ink:var(--skb-ink);--ui-line:currentColor;--ui-ink-70:var(--skb-ink);--ui-display-font:var(--skb-display-font);--ui-body-font:var(--skb-text-font);--ui-aspect:var(--skb-card-ratio,4/3)}
.skb-site .skb[data-skb-renderer] .ui-container{width:100%;max-width:none}
.skb-site .skb[data-skb-renderer] :is(.ui-hero,.ui-floating,.ui-section){padding:0;background:transparent;color:inherit;min-height:0}
.skb-site .skb[data-skb-renderer] :is(.ui-hero__grid,.ui-floating__grid){gap:clamp(1.5rem,5vw,5rem)}
.skb-site .skb[data-skb-renderer] :is(.skb-hero__copy,.ui-stack){min-width:0}
.skb-site .skb[data-skb-renderer] .ui-hero__media{position:relative;min-width:0}
.skb-site .skb[data-skb-renderer] .ui-hero__media img{border-radius:0;width:100%;height:100%;object-fit:cover}
.skb-site .skb[data-skb-renderer] .ui-card__media img{object-fit:contain}
.skb-site .skb[data-skb-renderer] .ui-card__media{aspect-ratio:var(--skb-card-ratio,4/3)}
.skb-site .skb[data-skb-renderer][data-skb-card-desc=off] .ui-card__desc,.skb-site .skb[data-skb-renderer][data-skb-card-add=off] .ui-card__add{display:none!important}
.skb-site .skb[data-skb-renderer] :is(.ui-card__media,.ui-hero__media,.ui-feature__media){border-radius:var(--kit-photo-round,var(--ui-radius-media));padding:var(--kit-photo-pad,0);background:var(--kit-photo-bg,transparent)}
.skb-site .skb[data-skb-renderer=hero-bleed] .ui-hero__media{border-radius:0;padding:0}
.skb-site .skb[data-skb-renderer=hero-bleed] .ui-hero__media::after{background:none}
.skb-site .skb[data-skb-renderer] .ui-gallery__item:has([data-skb-free]){overflow:visible}
.skb-site .skb[data-skb-renderer=hero-editorial] .ui-hero__copy{grid-column:auto}
.skb-site .skb[data-skb-renderer=hero-editorial] .ui-hero__grid{grid-template-columns:1.3fr .85fr;align-items:end}
.skb-site .skb[data-skb-renderer=hero-editorial] .ui-hero__media{order:0;grid-column:auto;aspect-ratio:3/4;margin-bottom:3rem}
.skb-site .skb[data-skb-renderer=hero-product] .ui-hero__grid{grid-template-columns:.8fr 1.4fr;align-items:center}
.skb-site .skb[data-skb-renderer=hero-product] .ui-hero__media{aspect-ratio:1;min-height:50vh}
.skb-site .skb[data-skb-renderer=hero-product] .ui-hero__media img{object-fit:contain}
.skb-site .skb[data-skb-renderer=hero-type] .skb-display{font-size:clamp(3rem,14vw,13rem);max-width:11ch;line-height:.88}
.skb-site .skb[data-skb-renderer=hero-type] .skb-lead{max-width:35ch;margin-left:auto}
.skb-site .skb[data-skb-renderer=hero-poster]{border-block:3px solid currentColor}
.skb-site .skb[data-skb-renderer=hero-poster] .skb-display{font-size:clamp(3rem,16vw,15rem);text-transform:uppercase;max-width:12ch;line-height:.85}
.skb-site .skb[data-skb-renderer=hero-poster] .skb-hero__copy{display:grid;gap:2rem}
.skb-site .skb[data-skb-renderer=hero-bleed]{padding:0!important}
.skb-site .skb[data-skb-renderer=hero-bleed] .ui-hero{min-height:85svh;isolation:isolate;display:grid}
.skb-site .skb[data-skb-renderer=hero-bleed] .ui-hero__media{position:absolute;inset:0;z-index:-2;margin:0;aspect-ratio:auto}
.skb-site .skb[data-skb-renderer=hero-bleed] .ui-hero::after{content:'';position:absolute;inset:0;z-index:-1;background:rgba(0,0,0,.62)}
.skb-site .skb[data-skb-renderer=hero-bleed] .ui-container{align-self:end;padding:clamp(2rem,6vw,6rem);color:white}
.skb-site .skb[data-skb-renderer=hero-bleed] .skb-btn{background:white;color:#111}
.skb-site .skb[data-skb-renderer=hero-bleed] .skb-btn--ghost{background:transparent;color:white;border-color:white}
.skb-site .skb[data-skb-renderer=hero-cover] .skb-hero__copy{display:grid;grid-template-columns:1fr 1fr;align-items:end;margin-bottom:2rem}
.skb-site .skb[data-skb-renderer=hero-cover] .skb-display{grid-column:1/-1;font-size:clamp(3rem,10vw,11rem);max-width:none;border-block:1px solid currentColor;padding-block:1rem}
.skb-site .skb[data-skb-renderer=hero-cover] .ui-hero__media{aspect-ratio:2/1;max-height:65svh}
.skb-site .skb[data-skb-renderer=hero-cover] .skb-photo-tag{position:relative;display:block;margin-top:.5rem;background:transparent;color:inherit}
.skb-site .skb[data-skb-renderer=hero-collage] .ui-floating__grid{grid-template-columns:1fr}
.skb-site .skb[data-skb-renderer=hero-collage] .ui-floating__stage{width:85%;margin-left:auto;min-height:480px;margin-top:-3rem}
.skb-site .skb[data-skb-renderer=hero-collage] .ui-floating__item:first-child{width:68%;left:0;top:0;aspect-ratio:4/3}
.skb-site .skb[data-skb-renderer=hero-collage] .ui-floating__item:nth-child(2){width:32%;right:0;bottom:0;top:auto;aspect-ratio:3/4}
.skb-site .skb[data-skb-renderer=story-manifesto] .skb-title{font-size:clamp(2.5rem,8vw,8rem)!important;max-width:20ch;line-height:1}
.skb-site .skb[data-skb-renderer=story-manifesto] .ui-statement{font:inherit;color:inherit}
.skb-site .skb[data-skb-renderer=story-manifesto] .skb-story__paragraphs{max-width:32rem;margin:3rem 0 0 auto}
.skb-site .skb[data-skb-renderer=story-quote] blockquote{margin:0;padding-left:10vw;border-left:2px solid currentColor}
.skb-site .skb[data-skb-renderer=story-quote] .skb-title{font-size:clamp(2.5rem,6vw,6rem)!important;font-style:italic}
.skb-site .skb[data-skb-renderer=story-chapters] .ui-chapter{background:var(--skb-bg);color:var(--skb-ink);min-height:30vh;border-top:1px solid currentColor;grid-template-columns:1fr;position:relative}
.skb-site .skb[data-skb-renderer=story-chapters] .ui-eyebrow{color:inherit;font-size:2rem}
.skb-site .skb[data-skb-renderer=gallery-bleed]{padding-inline:0!important}
.skb-site .skb[data-skb-renderer=gallery-bleed] .skb-head{padding-inline:clamp(1rem,4vw,4rem)}
.skb-site .skb[data-skb-renderer=gallery-bleed] .ui-gallery{display:block}
.skb-site .skb[data-skb-renderer=gallery-bleed] .ui-gallery__item{aspect-ratio:2/1}
.skb-site .skb[data-skb-renderer=gallery-strip] [data-skb-group=items]{overflow-x:auto}
.skb-site .skb[data-skb-renderer=gallery-collage] .ui-gallery{grid-template-columns:1.2fr .7fr 1fr;align-items:center;gap:3rem}
.skb-site .skb[data-skb-renderer=gallery-collage] .ui-gallery__item:nth-child(n){grid-column:auto;grid-row:auto;aspect-ratio:3/4}
.skb-site .skb[data-skb-renderer=gallery-collage] .ui-gallery__item:nth-child(even){transform:rotate(4deg);margin-top:5rem}
.skb-site .skb[data-skb-renderer=categories-index] .skb-collections__grid,.skb-site .skb[data-skb-renderer=categories-type] .skb-collections__grid{display:block;counter-reset:category}
.skb-site .skb[data-skb-renderer=categories-index] .skb-collection,.skb-site .skb[data-skb-renderer=categories-type] .skb-collection{display:grid;grid-template-columns:4rem 1fr 3rem;border-top:1px solid currentColor;padding:1.5rem 0;border-radius:0;box-shadow:none;counter-increment:category;background:transparent;color:inherit}
.skb-site .skb[data-skb-renderer=categories-index] .skb-collection::before{content:counter(category,decimal-leading-zero)}
.skb-site .skb[data-skb-renderer=categories-type] .skb-collection{grid-template-columns:1fr 3rem}
.skb-site .skb[data-skb-renderer=categories-type] .skb-collection__title{font-size:clamp(2rem,7vw,7rem);line-height:1}
.skb-site .skb[data-skb-renderer=categories-index] .skb-collection__img,.skb-site .skb[data-skb-renderer=categories-type] .skb-collection__img{display:none}
.skb-site .skb[data-skb-renderer=categories-images] .skb-collections__grid{grid-template-columns:1.6fr 1fr;align-items:start}
.skb-site .skb[data-skb-renderer=categories-images] .skb-collection:nth-child(even){margin-top:4rem}
.skb-site .skb[data-skb-renderer=footer-wordmark] .skb-wordmark{font-size:clamp(3rem,14vw,16rem);line-height:.9;margin:0 0 4rem;overflow-wrap:anywhere}
.skb-site .skb[data-skb-renderer=footer-editorial] .skb-footer__grid{grid-template-columns:2fr 1fr 1fr;border-top:1px solid currentColor;padding-top:2rem}
.skb-site .skb[data-skb-renderer=footer-editorial] .skb-footer__name{font-size:clamp(2rem,5vw,5rem)}
.skb-site .skb[data-skb-renderer=footer-minimal] .skb-footer__grid{display:flex;flex-wrap:wrap;justify-content:space-between;gap:2rem}
.skb-site .skb[data-skb-renderer] :is(.ui-card__name,.ui-card__index-title,.ui-h2,.ui-text){overflow-wrap:anywhere}
@media(min-width:900px){.skb-site .skb[data-skb-renderer][data-skb-flip] :is(.ui-hero__media,.ui-floating__stage){order:-1}}
@media(max-width:899px){
.skb-site .skb[data-skb-renderer=story-split] .ui-feature{grid-template-columns:1fr;gap:2rem}
.skb-site .skb[data-skb-renderer=story-split] .ui-feature__media{order:1}
.skb-site .skb[data-skb-renderer] .ui-hero__grid{grid-template-columns:1fr;gap:2rem}
.skb-site .skb[data-skb-renderer] .ui-hero__media{order:0;grid-column:auto;min-height:0;margin:0;max-height:65svh}
.skb-site .skb[data-skb-renderer=hero-bleed] .ui-hero__media{max-height:none}
.skb-site .skb[data-skb-renderer=hero-cover] .skb-hero__copy{grid-template-columns:1fr}
.skb-site .skb[data-skb-renderer=hero-cover] .ui-hero__media{aspect-ratio:4/3}
.skb-site .skb[data-skb-renderer=hero-collage] .ui-floating__stage{margin:1.5rem 0 0;width:100%;min-height:0}
.skb-site .skb[data-skb-renderer=hero-collage] .ui-floating__item:nth-child(n){width:100%;height:auto;position:relative;inset:auto;transform:none}
.skb-site .skb[data-skb-renderer=hero-collage] .ui-floating__frame{height:100%;aspect-ratio:4/3;transform:none}
.skb-site .skb[data-skb-renderer=hero-floating] .ui-floating__grid{grid-template-columns:1fr}
.skb-site .skb[data-skb-renderer=hero-floating] .ui-floating__stage{height:auto;display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:0}
.skb-site .skb[data-skb-renderer=hero-floating] .ui-floating__item:nth-child(n){position:relative;inset:auto;transform:none!important}
.skb-site .skb[data-skb-renderer=hero-floating] .ui-floating__frame{aspect-ratio:3/4;transform:none;box-shadow:none}
.skb-site .skb[data-skb-renderer=gallery-collage] .ui-gallery{grid-template-columns:1fr 1fr;gap:1rem}
.skb-site .skb[data-skb-renderer=gallery-collage] .ui-gallery__item:nth-child(n){margin:0;transform:none}
.skb-site .skb[data-skb-renderer=categories-images] .skb-collections__grid{grid-template-columns:1fr 1fr;gap:1rem}
.skb-site .skb[data-skb-renderer=categories-images] .skb-collection:nth-child(n){margin:0}
.skb-site .skb[data-skb-renderer=footer-editorial] .skb-footer__grid{grid-template-columns:1fr 1fr}
.skb-site .skb[data-skb-renderer=footer-editorial] .skb-footer__brand{grid-column:1/-1}
}
@media(max-width:599px){.skb-site .skb[data-skb-renderer=gallery-collage] .ui-gallery,.skb-site .skb[data-skb-renderer=categories-images] .skb-collections__grid{grid-template-columns:1fr}.skb-site .skb[data-skb-renderer=gallery-bleed] .ui-gallery__item{aspect-ratio:4/3}}
`;
