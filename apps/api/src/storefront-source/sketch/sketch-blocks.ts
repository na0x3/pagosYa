import { bestInkFor } from './sketch-schema';
import type { SketchBlock, SketchContext, StoreSketch } from './sketch-schema';

/** JSX generators for sketch blocks. Every merchant-controlled string is embedded as a
 * JSON.stringify'd expression — `{"…"}` — so no text can escape JSX or the template literal. */
const expr = (value: string) => `{${JSON.stringify(value)}}`;

/** Readable text colour for a given block background (WCAG contrast, shared with the palette repair). */
const inkFor = (bg: string, sketch: StoreSketch) => bestInkFor(bg, sketch.palette.ink);

export type RenderOptions = { h1?: boolean };
const open = (block: SketchBlock, sketch: StoreSketch, label?: string, extra = '') => {
  const bg = sketch.palette[block.bg];
  return `<section data-skb=${expr(block.id)} className=${expr(`skb skb-${block.type} skb--${block.size}`)}` +
    (label ? ` aria-label=${expr(label)}` : '') + (extra ? ` ${extra}` : '') +
    ` style={{ ['--skb-bg' as string]: ${JSON.stringify(bg)}, ['--skb-ink' as string]: ${JSON.stringify(inkFor(bg, sketch))} }}>`;
};

const img = (path: string, alt: string, className: string) => `<img className=${expr(className)} src=${expr(path)} alt=${expr(alt)} />`;

type Render = (block: SketchBlock & { type: never }, sketch: StoreSketch, ctx: SketchContext, options: RenderOptions) => string;
const generators: { [T in SketchBlock['type']]: (block: Extract<SketchBlock, { type: T }>, sketch: StoreSketch, ctx: SketchContext, options: RenderOptions) => string } = {
  hero: (b, s, ctx, options) => open(b, s) + `
    <div className="skb-hero__copy">
      <${options.h1 ? 'h1' : 'h2'} className="skb-display">${expr(b.headline)}</${options.h1 ? 'h1' : 'h2'}>
      ${b.sub ? `<p className="skb-lead">${expr(b.sub)}</p>` : ''}
      <a className="skb-btn" href=${expr(s.blocks.some(block => block.type === 'catalog') ? '#skb-catalogo' : '#contenido')}>${expr(b.cta)}</a>
    </div>
    ${b.photo ? `<div className=${expr(`skb-hero__media skb-hero__media--${b.variant}`)}>${img(b.photo, `Foto de ${ctx.storeName}`, 'skb-hero__img')}</div>` : ''}
  </section>`,
  marquee: (b, s) => open(b, s, 'Texto en movimiento') + `
    <div className="skb-marquee__track">
      <span>${expr(` ${b.text} · ${b.text} · ${b.text} · `)}</span>
      <span aria-hidden="true">${expr(` ${b.text} · ${b.text} · ${b.text} · `)}</span>
    </div>
  </section>`,
  catalog: (b, s, _ctx, options) => open(b, s) + `
    <div className="skb-head" id="skb-catalogo">
      ${b.kicker ? `<p className="skb-kicker">${expr(b.kicker)}</p>` : ''}
      <${options.h1 ? 'h1' : 'h2'} className="skb-title">${expr(b.title)}</${options.h1 ? 'h1' : 'h2'}>
    </div>
    <template data-pagosya-product-template>
      <article className="skb-card">
        <a className="skb-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
        <div className="skb-card__body">
          <h3 className="skb-card__name" data-product-field="name">Producto</h3>
          <p className="skb-card__desc" data-product-field="description" />
          <div className="skb-card__row"><span className="skb-card__price" data-product-field="price" /><button type="button" className="skb-card__add" data-product-add>Añadir</button></div>
        </div>
      </article>
    </template>
    <div className="skb-list" data-pagosya-catalog />
  </section>`,
  story: (b, s, ctx, options) => open(b, s) + `
    <div className="skb-story__copy">
      <${options.h1 ? 'h1' : 'h2'} className="skb-title">${expr(b.title)}</${options.h1 ? 'h1' : 'h2'}>
      ${b.paragraphs.map(p => `<p className="skb-lead">${expr(p)}</p>`).join('\n      ')}
    </div>
    ${b.photo ? `<div className="skb-story__media">${img(b.photo, `Foto de ${ctx.storeName}`, 'skb-story__img')}</div>` : ''}
  </section>`,
  reviews: (b, s, _ctx, options) => open(b, s) + `
    <${options.h1 ? 'h1' : 'h2'} className="skb-title">${expr(b.title)}</${options.h1 ? 'h1' : 'h2'}>
    <div className="skb-reviews__grid">
      ${b.quotes.map(q => `<figure className="skb-review"><blockquote>${expr(q.text)}</blockquote><figcaption>${expr(q.name)}</figcaption></figure>`).join('\n      ')}
    </div>
  </section>`,
  faq: (b, s, _ctx, options) => open(b, s) + `
    <${options.h1 ? 'h1' : 'h2'} className="skb-title">${expr(b.title)}</${options.h1 ? 'h1' : 'h2'}>
    ${b.items.map(i => `<details className="skb-faq__item"><summary>${expr(i.q)}</summary><p>${expr(i.a)}</p></details>`).join('\n    ')}
  </section>`,
  banner: (b, s, _ctx, options) => open(b, s) + `
    <${options.h1 ? 'h1' : 'h2'} className="skb-display skb-banner__headline">${expr(b.headline)}</${options.h1 ? 'h1' : 'h2'}>
    <a className="skb-btn" href=${expr(b.href)}>${expr(b.cta)}</a>
  </section>`,
  gallery: (b, s, ctx, options) => open(b, s) + `
    <${options.h1 ? 'h1' : 'h2'} className="skb-title">${expr(b.title)}</${options.h1 ? 'h1' : 'h2'}>
    <div className="skb-gallery__grid">
      ${b.photos.map((p, i) => img(p, `Foto ${i + 1} de ${ctx.storeName}`, 'skb-gallery__img')).join('\n      ')}
    </div>
  </section>`,
  newsletter: (b, s, _ctx, options) => open(b, s, undefined, 'data-pagosya-subscribe-block') + `
    <${options.h1 ? 'h1' : 'h2'} className="skb-title">${expr(b.title)}</${options.h1 ? 'h1' : 'h2'}>
    ${b.note ? `<p className="skb-lead">${expr(b.note)}</p>` : ''}
    <button type="button" className="skb-btn skb-subscribe" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
      <span className="skb-subscribe__field">Tu correo electrónico</span>
      <span className="skb-subscribe__submit">${expr(b.cta || 'Suscribirme')}</span>
    </button>
    <p role="status" className="skb-subscribe__status" />
  </section>`,
  footer: (b, s, ctx) => open(b, s, 'Pie de página') + `
    ${b.tagline ? `<p className="skb-footer__tagline">${expr(b.tagline)}</p>` : ''}
    <nav className="skb-footer__links" aria-label="Pie de página"><a href="index.html">Inicio</a><a href="checkout.html">Mi pedido</a></nav>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
    ${b.wordmark === 'giant' ? `<p className="skb-wordmark" aria-hidden="true">${expr(ctx.storeName)}</p>` : `<p className="skb-footer__name">${expr(ctx.storeName)}</p>`}
  </section>`,
};

export function renderBlock(block: SketchBlock, sketch: StoreSketch, ctx: SketchContext, options: RenderOptions = {}): string {
  return (generators[block.type] as Render)(block as SketchBlock & { type: never }, sketch, ctx, options);
}

const CSS: Record<SketchBlock['type'], string> = {
  hero: `
.skb-hero { display: grid; gap: 2rem; align-items: center; }
@media (min-width: 900px) { .skb-hero { grid-template-columns: 1.1fr 1fr; } }
.skb-hero__img { width: 100%; height: auto; border-radius: 1.25rem; display: block; }
.skb-hero__media--full-bleed .skb-hero__img { border-radius: 0; }
.skb-hero__media--stacked { order: -1; }`,
  marquee: `
.skb-marquee { overflow: hidden; padding-block: 1.1em; white-space: nowrap; }
.skb-marquee__track { display: inline-flex; animation: skb-scroll 24s linear infinite; font-family: var(--skb-display-font); font-size: clamp(1.4rem, 3.2vw, 2.6rem); text-transform: uppercase; letter-spacing: 0.04em; }
.skb-marquee__track span { flex: none; }
@keyframes skb-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }`,
  catalog: `
.skb-list { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
.skb-card { background: color-mix(in srgb, var(--skb-bg) 70%, #ffffff 30%); border-radius: 1rem; overflow: hidden; display: flex; flex-direction: column; }
.skb-card__media img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; }
.skb-card__body { padding: 1rem; display: grid; gap: 0.5rem; }
.skb-card__row { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; }
.skb-card__add { border: 0; border-radius: 999px; padding: 0.55em 1.1em; background: var(--skb-ink); color: var(--skb-bg); font: inherit; cursor: pointer; }`,
  story: `
.skb-story { display: grid; gap: 2rem; align-items: center; }
@media (min-width: 900px) { .skb-story { grid-template-columns: 1fr 1fr; } }
.skb-story__img { width: 100%; height: auto; border-radius: 1.25rem; display: block; }`,
  reviews: `
.skb-reviews__grid { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
.skb-review { margin: 0; padding: 1.25rem; border-radius: 1rem; background: color-mix(in srgb, var(--skb-bg) 80%, var(--skb-ink) 8%); }
.skb-review blockquote { margin: 0 0 0.6rem; font-size: 1.05rem; }
.skb-review figcaption { opacity: 0.7; font-size: 0.9rem; }`,
  faq: `
.skb-faq__item { border-bottom: 1px solid color-mix(in srgb, var(--skb-ink) 25%, transparent); padding-block: 0.9rem; }
.skb-faq__item summary { cursor: pointer; font-weight: 600; font-size: 1.1rem; }
.skb-faq__item p { margin: 0.6rem 0 0; }`,
  banner: `
.skb-banner { text-align: center; display: grid; gap: 1.6rem; justify-items: center; }
.skb-banner__headline { max-width: 18ch; }`,
  gallery: `
.skb-gallery__grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.skb-gallery__img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 0.9rem; display: block; }`,
  newsletter: `
.skb-newsletter { text-align: center; display: grid; gap: 1rem; justify-items: center; }`,
  footer: `
.skb-footer { padding-bottom: 0; overflow: hidden; }
.skb-footer__links { display: flex; gap: 1.25rem; flex-wrap: wrap; margin-block: 0.8rem; }
.skb-footer__links a, .skb-footer .pagosya-info-nav a { color: var(--skb-ink); }
.skb-wordmark { font-family: var(--skb-display-font); font-size: clamp(4rem, 18vw, 16rem); line-height: 0.78; margin: 0.5em 0 -0.12em; letter-spacing: -0.02em; font-weight: 700; }`,
};

export const blockCss = (type: SketchBlock['type']) => CSS[type];

export const SKETCH_BASE_CSS = `
.skb { background: var(--skb-bg); color: var(--skb-ink); padding-inline: clamp(1rem, 5vw, 4rem); }
.skb--s { padding-block: clamp(1.6rem, 3vw, 2.5rem); }
.skb--m { padding-block: clamp(2.6rem, 5vw, 4.5rem); }
.skb--l { padding-block: clamp(4rem, 8vw, 7rem); }
.skb--xl { padding-block: clamp(5.5rem, 11vw, 10rem); }
.skb-display { font-family: var(--skb-display-font); font-size: clamp(2.4rem, 7vw, 5.2rem); line-height: 1.02; margin: 0 0 0.4em; letter-spacing: -0.015em; }
.skb-title { font-family: var(--skb-display-font); font-size: clamp(1.7rem, 4vw, 2.8rem); line-height: 1.08; margin: 0 0 0.6em; }
.skb-kicker { text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.8rem; opacity: 0.75; margin: 0 0 0.6em; }
.skb-lead { font-size: clamp(1rem, 1.6vw, 1.2rem); line-height: 1.6; max-width: 62ch; }
.skb-btn { display: inline-block; background: var(--skb-ink); color: var(--skb-bg); border-radius: 999px; padding: 0.8em 1.7em; text-decoration: none; font-weight: 600; }
.skb img { max-width: 100%; }
@media (prefers-reduced-motion: reduce) { .skb-marquee__track { animation: none; } }
`;
