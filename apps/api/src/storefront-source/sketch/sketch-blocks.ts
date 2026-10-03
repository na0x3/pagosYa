import { SKETCH_COPY_ORDER } from '@pagosya/shared-types';
import { bestInkFor, resolveBg } from './sketch-schema';
import type { SketchBlock, SketchContext, StoreSketch } from './sketch-schema';

/** JSX generators for sketch blocks. Every merchant-controlled string is embedded as a
 * JSON.stringify'd expression — `{"…"}` — so no text can escape JSX or the template literal. */
const expr = (value: string) => `{${JSON.stringify(value)}}`;
const editable = (field: string) => `data-skb-field=${expr(field)}`;
/** A selectable leaf for the Boceto canvas (Figma-style drill-down); keys match sketchNodeTree. */
const node = (key: string) => `data-skb-node=${expr(key)}`;
/** A group wrapper: its key plus any saved layout as data attributes the base CSS reads. */
const group = (block: SketchBlock, key: string) => {
  const layout = block.layout?.[key] ?? {};
  return `data-skb-group=${expr(key)}` + (layout.gap ? ` data-skb-gap=${expr(layout.gap)}` : '') + (layout.dir ? ` data-skb-dir=${expr(layout.dir)}` : '')
    + (layout.align ? ` data-skb-galign=${expr(layout.align)}` : '') + (layout.valign ? ` data-skb-valign=${expr(layout.valign)}` : '');
};

/** Readable text colour for a given block background (WCAG contrast, shared with the palette repair). */
const inkFor = (bg: string, sketch: StoreSketch) => bestInkFor(bg, sketch.palette.ink);

export type RenderOptions = { h1?: boolean };
const open = (block: SketchBlock, sketch: StoreSketch, label?: string, extra = '', vars: Record<string, string> = {}) => {
  const bg = resolveBg(sketch.palette, block.bg);
  const styleVars: Record<string, string> = { '--skb-bg': bg, '--skb-ink': inkFor(bg, sketch), ...vars };
  const align = block.align === 'center' || block.align === 'end' ? ` data-skb-align=${expr(block.align)}` : '';
  const flip = block.flip ? ' data-skb-flip="on"' : '';
  return `<section data-skb=${expr(block.id)} id=${expr(`skb-${block.id}`)} className=${expr(`skb skb-${block.type} skb--${block.size}`)}` +
    (label ? ` aria-label=${expr(label)}` : '') + align + flip + (extra ? ` ${extra}` : '') +
    ` style={{ ${Object.entries(styleVars).map(([key, value]) => `[${JSON.stringify(key)} as string]: ${JSON.stringify(value)}`).join(', ')} }}>`;
};

/** `slot` names the sketch field the photo comes from, so the Boceto canvas can swap it in place. */
const img = (path: string, alt: string, className: string, slot?: string, nodeKey?: string) => `<img className=${expr(className)} src=${expr(path)} alt=${expr(alt)}${slot ? ` data-skb-photo=${expr(slot)}` : ''}${nodeKey ? ` ${node(nodeKey)}` : ''} />`;
/** Primary + ghost button row; `swap` puts the ghost button first (dragged on the canvas). */
const actionsRow = (block: SketchBlock, href: string, cta: string, cta2: string, swap?: boolean) => {
  const primary = `<a className="skb-btn" href=${expr(href)} ${node('cta')} ${editable('cta')}>${expr(cta)}</a>`;
  const ghost = cta2 ? `<a className="skb-btn skb-btn--ghost" href=${expr(href)} ${node('cta2')} ${editable('cta2')}>${expr(cta2)}</a>` : '';
  return `<div className="skb-actions" data-skb-el="actions" ${group(block, 'actions')}>${swap ? ghost + primary : primary + ghost}</div>`;
};

/** The ✦ overline above a section title — the single detail that most makes a page read "dressed". */
const kicker = (text: string) => text ? `<p className="skb-kicker" ${node('kicker')} ${editable('kicker')}>${expr(text)}</p>` : '';
/** A small pill sitting on a photo (caption or tag), magazine-style. */
const photoTag = (text: string, field: string) => text ? `<p className="skb-photo-tag" ${node(field)} ${editable(field)}>${expr(text)}</p>` : '';
/** Section head: kicker + title left, an optional right-aligned note at the baseline. */
const head = (block: SketchBlock & { kicker?: string; title: string }, note: string | undefined, heading: string) =>
  `<div className="skb-head" ${group(block, 'head')}>
      <div>
        ${kicker(block.kicker ?? '')}
        <${heading} className="skb-title" ${node('title')} ${editable('title')}>${expr(block.title)}</${heading}>
      </div>
      ${note ? `<p className="skb-head__note" ${node('note')} ${editable('note')}>${expr(note)}</p>` : ''}
    </div>`;

/** A rotated circular sticker; a saved drag position overrides the default corner. */
const sticker = (text: string, pos?: { x: number; y: number }) => text
  ? `<p className="skb-sticker" data-skb-el="sticker" aria-hidden="true"${pos ? ` style={{ left: ${JSON.stringify(pos.x + '%')}, top: ${JSON.stringify(pos.y + '%')}, right: 'auto' }}` : ''} ${editable('sticker')}>${expr(text)}</p>`
  : '';

/** Copy-column children keyed for the Boceto element drag: emitted in `block.order` when present. */
const ordered = (parts: Record<string, string>, order: string[] | undefined, fallback: readonly string[]) =>
  (order ?? fallback).map(key => parts[key] ?? '').filter(Boolean).join('\n      ');

type Render = (block: SketchBlock & { type: never }, sketch: StoreSketch, ctx: SketchContext, options: RenderOptions) => string;
const generators: { [T in SketchBlock['type']]: (block: Extract<SketchBlock, { type: T }>, sketch: StoreSketch, ctx: SketchContext, options: RenderOptions) => string } = {
  hero: (b, s, ctx, options) => {
    const heading = options.h1 ? 'h1' : 'h2';
    const anchor = s.blocks.some(block => block.type === 'catalog') ? '#skb-catalogo' : '#contenido';
    const parts: Record<string, string> = {
      badge: b.badge ? `<p className="skb-badge" data-skb-el="badge" ${editable('badge')}>${expr(b.badge)}</p>` : '',
      headline: `<${heading} className="skb-display" data-skb-el="headline" ${editable('headline')}>${expr(b.headline)}</${heading}>`,
      sub: b.sub ? `<p className="skb-lead" data-skb-el="sub" ${editable('sub')}>${expr(b.sub)}</p>` : '',
      actions: actionsRow(b, anchor, b.cta, b.cta2, b.swap),
      trust: b.trust ? `<p className="skb-trust" data-skb-el="trust" ${editable('trust')}>${expr(b.trust)}</p>` : '',
      note: b.note ? `<p className="skb-note" data-skb-el="note" ${editable('note')}>${expr(b.note)}</p>` : '',
    };
    return open(b, s) + `
    <div className="skb-hero__copy" ${group(b, 'copy')}>
      ${ordered(parts, b.order, SKETCH_COPY_ORDER.hero)}
    </div>
    ${b.photo ? `<div className=${expr(`skb-hero__media skb-hero__media--${b.variant}`)} ${group(b, 'media')}>${img(b.photo, `Foto de ${ctx.storeName}`, 'skb-hero__img', 'photo', 'photo')}${photoTag(b.caption, 'caption')}${sticker(b.sticker, b.stickerPos)}</div>` : sticker(b.sticker, b.stickerPos)}
  </section>`;
  },
  announce: (b, s) => open(b, s, 'Avisos') + `
    <div className="skb-announce__row" ${group(b, 'row')}><span ${node('left')} ${editable('left')}>${expr(b.left)}</span><span ${node('right')} ${editable('right')}>${expr(b.right)}</span></div>
  </section>`,
  split: (b, s, ctx, options) => {
    const heading = options.h1 ? 'h1' : 'h2';
    const parts: Record<string, string> = {
      headline: `<${heading} className="skb-display" data-skb-el="headline" ${editable('headline')}>${expr(b.headline)}</${heading}>`,
      body: b.body ? `<p className="skb-lead" data-skb-el="body" ${editable('body')}>${expr(b.body)}</p>` : '',
      pills: b.pills.length ? `<div className="skb-pills" data-skb-el="pills" ${group(b, 'pills')}>${b.pills.map((pill, i) => `<span className="skb-pill" ${node(String(i))} ${editable(`pills.${i}`)}>${expr(pill)}</span>`).join('')}</div>` : '',
      stats: b.stats.length ? `<div className="skb-stats" data-skb-el="stats" ${group(b, 'stats')}>${b.stats.map((stat, i) => `<div className="skb-stat" ${node(String(i))}><span className="skb-stat__value" ${editable(`stats.${i}.value`)}>${expr(stat.value)}</span><span className="skb-stat__label" ${editable(`stats.${i}.label`)}>${expr(stat.label)}</span></div>`).join('')}</div>` : '',
      boxes: b.boxes?.length ? `<div className="skb-boxes" data-skb-el="boxes" ${group(b, 'boxes')}>${b.boxes.map((box, i) => `<div className="skb-box" ${node(String(i))}>${box.icon ? `<img className="skb-box__icon" src=${expr(`assets/icons/${box.icon}.svg`)} alt="" aria-hidden="true" />` : ''}<div><p className="skb-box__title" ${editable(`boxes.${i}.title`)}>${expr(box.title)}</p>${box.text ? `<p className="skb-box__text" ${editable(`boxes.${i}.text`)}>${expr(box.text)}</p>` : ''}</div></div>`).join('')}</div>` : '',
      actions: actionsRow(b, b.href, b.cta, b.cta2, b.swap),
    };
    return open(b, s) + `
    <div className="skb-split__copy" ${group(b, 'copy')}>
      ${kicker(b.kicker)}
      ${ordered(parts, b.order, SKETCH_COPY_ORDER.split)}
    </div>
    ${b.photo ? `<div className="skb-split__media" ${group(b, 'media')}>${img(b.photo, `Foto de ${ctx.storeName}`, 'skb-split__img', 'photo', 'photo')}${photoTag(b.tag, 'tag')}${sticker(b.sticker, b.stickerPos)}</div>` : sticker(b.sticker, b.stickerPos)}
  </section>`;
  },
  marquee: (b, s) => {
    const segment = ` ${b.text} ${b.glyph} ${b.text} ${b.glyph} ${b.text} ${b.glyph} `;
    const duration = { s: '18s', m: '24s', l: '32s', xl: '40s' }[b.size];
    return open(b, s, 'Texto en movimiento', '', { '--skb-marquee-dur': duration }) + `
    <div className="skb-marquee__track">
      <span>${expr(segment)}</span>
      <span aria-hidden="true">${expr(segment)}</span>
    </div>
  </section>`;
  },
  steps: (b, s, _ctx, options) => open(b, s) + `
    ${head(b, b.note, options.h1 ? 'h1' : 'h2')}
    <div className="skb-steps__grid" ${group(b, 'items')}>
      ${b.items.map((item, i) => `<article className="skb-step" ${node(String(i))}><div className="skb-step__top"><span className="skb-step__icon-wrap"><img className="skb-step__icon" src=${expr(`assets/icons/${item.icon}.svg`)} alt="" aria-hidden="true" /></span><span className="skb-step__number">${expr(String(i + 1).padStart(2, '0'))}</span></div><h3 className="skb-step__title" ${editable(`items.${i}.title`)}>${expr(item.title)}</h3><p className="skb-step__text" ${editable(`items.${i}.text`)}>${expr(item.text)}</p></article>`).join('\n      ')}
    </div>
  </section>`,
  catalog: (b, s, _ctx, options) => {
    // Corner badges reach the runtime-cloned product cards through CSS string vars, cycled by nth-child.
    const badgeVars = Object.fromEntries(b.badges.map((badge, i) => [`--skb-badge-${i + 1}`, `"${badge}"`]));
    const cardVars = { ...badgeVars, '--skb-card-ratio': { '4-3': '4 / 3', '1-1': '1 / 1', '3-4': '3 / 4' }[b.cardRatio] ?? '4 / 3' };
    const cardFlags = `data-skb-card-desc=${expr(b.cardDesc === false ? 'off' : 'on')} data-skb-card-add=${expr(b.cardAdd === false ? 'off' : 'on')}`;
    return open(b, s, undefined, cardFlags, cardVars) + `
    <div className="skb-head" id="skb-catalogo" ${group(b, 'head')}>
      <div>
        ${kicker(b.kicker)}
        <${options.h1 ? 'h1' : 'h2'} className="skb-title" ${node('title')} ${editable('title')}>${expr(b.title)}</${options.h1 ? 'h1' : 'h2'}>
      </div>
      ${b.seeAll ? `<a className="skb-see" href="#skb-catalogo" ${node('seeAll')} ${editable('seeAll')}>${expr(b.seeAll)}</a>` : ''}
    </div>
    <template data-pagosya-product-template>
      <article className="skb-card">
        <a className="skb-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
        <div className="skb-card__body">
          <div className="skb-card__row"><h3 className="skb-card__name" data-product-field="name">Producto</h3><span className="skb-card__price" data-product-field="price" /></div>
          <p className="skb-card__desc" data-product-field="description" />
          <button type="button" className="skb-card__add" data-product-add>Añadir</button>
        </div>
      </article>
    </template>
    <div className="skb-list" data-pagosya-catalog ${group(b, 'items')} />
    ${b.stripLeft || b.stripRight ? `<div className="skb-strip"><span ${editable('stripLeft')}>${expr(b.stripLeft)}</span><span ${editable('stripRight')}>${expr(b.stripRight)}</span></div>` : ''}
  </section>`;
  },
  collections: (b, s, ctx, options) => open(b, s) + `
    ${head(b, b.note, options.h1 ? 'h1' : 'h2')}
    <div className="skb-collections__grid" ${group(b, 'items')}>
      ${b.items.map((item, i) => `<a className="skb-collection" ${node(String(i))} href=${expr(s.blocks.some(block => block.type === 'catalog') ? '#skb-catalogo' : '#contenido')}>${item.photo ? img(item.photo, `Foto de ${ctx.storeName}`, 'skb-collection__img', `items.${i}.photo`) : ''}<div className="skb-collection__body"><h3 className="skb-collection__title" ${editable(`items.${i}.title`)}>${expr(item.title)}</h3><p className="skb-collection__text" ${editable(`items.${i}.text`)}>${expr(item.text)}</p></div><span className="skb-collection__arrow" aria-hidden="true">↗</span></a>`).join('\n      ')}
    </div>
  </section>`,
  story: (b, s, ctx, options) => {
    const heading = options.h1 ? 'h1' : 'h2';
    const parts: Record<string, string> = {
      title: `<${heading} className="skb-title" data-skb-el="title" ${editable('title')}>${expr(b.title)}</${heading}>`,
      paragraphs: b.paragraphs.length ? `<div className="skb-story__paragraphs" data-skb-el="paragraphs" ${group(b, 'paragraphs')}>${b.paragraphs.map((p, i) => `<p className="skb-lead" ${node(String(i))} ${editable(`paragraphs.${i}`)}>${expr(p)}</p>`).join('')}</div>` : '',
    };
    return open(b, s) + `
    <div className="skb-story__copy" ${group(b, 'copy')}>
      ${kicker(b.kicker)}
      ${ordered(parts, b.order, SKETCH_COPY_ORDER.story)}
    </div>
    ${b.photo ? `<div className="skb-story__media" ${group(b, 'media')}>${img(b.photo, `Foto de ${ctx.storeName}`, 'skb-story__img', 'photo', 'photo')}</div>` : ''}
  </section>`;
  },
  reviews: (b, s, ctx, options) => open(b, s) + `
    <div className="skb-head" ${group(b, 'head')}>
      <div>
        ${kicker(b.kicker)}
        <${options.h1 ? 'h1' : 'h2'} className="skb-title" ${node('title')} ${editable('title')}>${expr(b.title)}</${options.h1 ? 'h1' : 'h2'}>
      </div>
      ${b.ratingValue ? `<div className="skb-rating" ${node('rating')}><p className="skb-rating__value" ${editable('ratingValue')}>${expr(b.ratingValue)}</p>${b.ratingSource ? `<p className="skb-rating__source" ${editable('ratingSource')}>${expr(b.ratingSource)}</p>` : ''}</div>` : ''}
    </div>
    <div className="skb-reviews__grid" ${group(b, 'items')}>
      ${b.quotes.map((q, i) => `<figure className="skb-review" ${node(String(i))}><p className="skb-review__stars" aria-hidden="true">★★★★★</p><blockquote ${editable(`quotes.${i}.text`)}>${expr(q.text)}</blockquote><figcaption><span ${editable(`quotes.${i}.name`)}>${expr(q.name)}</span>${q.place ? `<span className="skb-review__place" ${editable(`quotes.${i}.place`)}>${expr(q.place)}</span>` : ''}</figcaption></figure>`).join('\n      ')}
    </div>
    ${b.photos.length ? `<div className="skb-reviews__photos">${b.photos.map((p, i) => img(p, `Foto ${i + 1} de clientes`, 'skb-reviews__photo', `photos.${i}`)).join('')}<p className="skb-reviews__handle" ${editable('handle')}>${expr(b.handle || ctx.storeName)}</p></div>` : ''}
  </section>`,
  faq: (b, s, _ctx, options) => open(b, s) + `
    ${head(b, undefined, options.h1 ? 'h1' : 'h2')}
    <div className="skb-faq__list" ${group(b, 'items')}>
      ${b.items.map((item, i) => `<details className="skb-faq__item" ${node(String(i))}><summary ${editable(`items.${i}.q`)}>${expr(item.q)}</summary><p ${editable(`items.${i}.a`)}>${expr(item.a)}</p></details>`).join('\n      ')}
    </div>
  </section>`,
  banner: (b, s, _ctx, options) => {
    const heading = options.h1 ? 'h1' : 'h2';
    const parts: Record<string, string> = {
      headline: `<${heading} className="skb-display skb-banner__headline" data-skb-el="headline" ${editable('headline')}>${expr(b.headline)}</${heading}>`,
      cta: `<a className="skb-btn" href=${expr(b.href)} data-skb-el="cta" ${editable('cta')}>${expr(b.cta)}</a>`,
    };
    return open(b, s) + `
    <div className="skb-banner__copy" ${group(b, 'copy')}>
      ${kicker(b.kicker)}
      ${ordered(parts, b.order, SKETCH_COPY_ORDER.banner)}
    </div>
    ${sticker(b.sticker, b.stickerPos)}
  </section>`;
  },
  gallery: (b, s, ctx, options) => open(b, s) + `
    ${head(b, undefined, options.h1 ? 'h1' : 'h2')}
    <div className="skb-gallery__grid" ${group(b, 'items')}>
      ${b.photos.map((p, i) => img(p, `Foto ${i + 1} de ${ctx.storeName}`, 'skb-gallery__img', `photos.${i}`, String(i))).join('\n      ')}
    </div>
  </section>`,
  newsletter: (b, s, ctx, options) => {
    const heading = options.h1 ? 'h1' : 'h2';
    const parts: Record<string, string> = {
      title: `<${heading} className="skb-title" data-skb-el="title" ${editable('title')}>${expr(b.title)}</${heading}>`,
      note: b.note ? `<p className="skb-lead" data-skb-el="note" ${editable('note')}>${expr(b.note)}</p>` : '',
      form: `<div className="skb-subscribe-wrap" data-skb-el="form">
      <button type="button" className="skb-btn skb-subscribe" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
        <span className="skb-subscribe__field">Tu correo electrónico</span>
        <span className="skb-subscribe__submit">${expr(b.cta || 'Suscribirme')}</span>
      </button>
      <p className="skb-subscribe__legal">Solo novedades y ofertas. Te das de baja cuando quieras.</p>
      ${s.blocks.some(block => block.type === 'catalog') ? '<a className="skb-subscribe__account" data-pagosya-account="" href="acceso-ingresar.html">¿Ya tienes cuenta? Ingresa</a>' : ''}
    </div>`,
    };
    const copy = `${kicker(b.kicker)}
    ${ordered(parts, b.order, SKETCH_COPY_ORDER.newsletter)}`;
    const status = '<p role="status" className="skb-subscribe__status" />';
    const formAttrs = `data-pagosya-subscribe-block data-skb-form=${expr(b.form || 'pill')}`;
    return b.variant === 'split' && b.photo
      ? open(b, s, undefined, formAttrs) + `
    <div className="skb-newsletter__grid">
      <div className="skb-newsletter__copy" ${group(b, 'copy')}>${copy}${status}</div>
      <div className="skb-newsletter__media" ${group(b, 'media')}>${img(b.photo, `Foto de ${ctx.storeName}`, 'skb-newsletter__img', 'photo', 'photo')}</div>
    </div>
  </section>`
      : open(b, s, undefined, formAttrs) + `
    <div className="skb-newsletter__stack" ${group(b, 'copy')}>${copy}</div>
    ${status}
  </section>`;
  },
  footer: (b, s, ctx) => open(b, s, 'Pie de página') + `
    <div className="skb-footer__grid">
      <div className="skb-footer__brand">
        <p className="skb-footer__name">${expr(ctx.storeName)}</p>
        ${b.tagline ? `<p className="skb-footer__tagline" ${editable('tagline')}>${expr(b.tagline)}</p>` : ''}
      </div>
      <nav className="skb-footer__links" aria-label="Pie de página"><p className="skb-footer__col-title">Tienda</p><a href="index.html">Inicio</a>${s.blocks.some(block => block.type === 'catalog') ? '<a href="index.html#skb-catalogo">Productos</a>' : ''}<a href="checkout.html">Mi pedido</a></nav>
      <div><p className="skb-footer__col-title">Información</p><nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" /></div>
    </div>
    <div className="skb-footer__legal-row">
      <p className="skb-footer__legal">${expr(`© ${ctx.storeName}`)}</p>
      <div className="skb-footer__pay" aria-label="Medios de pago"><span>QR</span><span>VISA</span><span>MASTERCARD</span></div>
    </div>
    ${b.wordmark === 'giant' ? `<p className="skb-wordmark" aria-hidden="true">${expr(ctx.storeName)}</p>` : ''}
  </section>`,
};

export function renderBlock(block: SketchBlock, sketch: StoreSketch, ctx: SketchContext, options: RenderOptions = {}): string {
  return (generators[block.type] as Render)(block as SketchBlock & { type: never }, sketch, ctx, options);
}

/** The designed login / sign-up page. Everything around the form is the sketch's; the form is the kit AccountGatePage,
 * whose container the trusted platform frame covers with the real inputs (only geometry crosses that boundary). */
export function renderAccount(sketch: StoreSketch, ctx: SketchContext, view: 'login' | 'register'): string {
  const a = sketch.account;
  const bg = resolveBg(sketch.palette, a.bg);
  const vars = { '--skb-bg': bg, '--skb-ink': inkFor(bg, sketch) };
  const other = view === 'login'
    ? '<p className="skb-acct__switch">¿No tienes cuenta? <a data-pagosya-account="register" href="acceso-registro.html">Crea una</a></p>'
    : '<p className="skb-acct__switch">¿Ya tienes cuenta? <a data-pagosya-account="login" href="acceso-ingresar.html">Ingresa</a></p>';
  return `<section data-skb="account" id="skb-account" className="skb skb-acct skb--l" data-skb-acct=${expr(a.layout)} style={{ ${Object.entries(vars).map(([key, value]) => `[${JSON.stringify(key)} as string]: ${JSON.stringify(value)}`).join(', ')} }}>
      <div className="skb-acct__intro">
        ${a.photo ? img(a.photo, `Foto de ${ctx.storeName}`, 'skb-acct__img', 'photo') : ''}
        <div className="skb-acct__copy" data-skb-group="intro">
          ${kicker(a.kicker)}
          <h2 className="skb-title" ${node('title')} ${editable('title')}>${expr(a.title)}</h2>
          <p className="skb-lead" ${node('lead')} ${editable('lead')}>${expr(a.lead)}</p>
          ${a.perks.length ? `<ul className="skb-acct__perks" data-skb-group="perks">${a.perks.map((perk, i) => `<li ${node(String(i))}><span className="skb-acct__perk-icon"><img src=${expr(`assets/icons/${perk.icon}.svg`)} alt="" aria-hidden="true" /></span><span ${editable(`perks.${i}.text`)}>${expr(perk.text)}</span></li>`).join('')}</ul>` : ''}
        </div>
      </div>
      <div className="skb-acct__form">
        <AccountGatePage view=${expr(view)} />
        ${other}
      </div>
    </section>`;
}

export const ACCOUNT_CSS = `
.skb-acct { display: grid; gap: clamp(1.5rem, 4vw, 3.5rem); align-items: center; }
@media (min-width: 900px) { .skb-acct[data-skb-acct="split"] { grid-template-columns: 1.05fr 1fr; } }
.skb-acct__intro { display: grid; gap: 1.4rem; }
.skb-acct__img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--skb-r); display: block; }
.skb-acct__perks { list-style: none; margin: 0.4rem 0 0; padding: 0; display: grid; gap: 0.7rem; }
.skb-acct__perks li { display: flex; align-items: center; gap: 0.75rem; font-weight: 600; }
.skb-acct__perk-icon { width: 2.2rem; height: 2.2rem; flex: none; border-radius: 50%; display: grid; place-items: center; background: var(--skb-paper); }
.skb-acct__perk-icon img { width: 1.1rem; height: 1.1rem; }
.skb-acct__form { background: var(--skb-paper); color: var(--skb-page-ink); border-radius: var(--skb-r); padding: clamp(1.4rem, 3vw, 2.4rem); box-shadow: 0 24px 60px rgba(0,0,0,.12); }
.skb-acct .ui-account-gate { min-height: 0; padding-block: 0; }
.skb-acct .ui-account-gate > .ui-container { width: 100%; max-width: none; }
.skb-acct .ui-display { font-size: clamp(1.6rem, 3vw, 2.3rem); margin-bottom: 0.6rem; }
.skb-acct .ui-button { border-radius: var(--skb-btn-r); background: var(--skb-accent); color: var(--skb-accent-ink); border-color: transparent; }
.skb-acct__switch { margin: 1.1rem 0 0; font-size: 0.9rem; }
.skb-acct__switch a { color: inherit; font-weight: 700; text-underline-offset: 3px; }
.skb-acct[data-skb-acct="center"] { max-width: 36rem; margin-inline: auto; text-align: center; }
.skb-acct[data-skb-acct="center"] .skb-acct__img { display: none; }
.skb-acct[data-skb-acct="center"] .skb-acct__perks { justify-content: center; }
.skb-acct[data-skb-acct="center"] .skb-acct__perks li { justify-content: center; }
`;

const CSS: Record<SketchBlock['type'], string> = {
  announce: `
.skb-announce { padding-block: 0.6rem; font-size: 0.82rem; letter-spacing: 0.06em; text-transform: uppercase; }
.skb-announce__row { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }`,
  split: `
.skb-split { display: grid; gap: 0; padding: 0; }
@media (min-width: 900px) { .skb-split { grid-template-columns: 1fr 1fr; } }
.skb-split__copy { padding: clamp(2rem, 6vw, 5rem) clamp(1.2rem, 5vw, 4rem); display: grid; gap: 1.1rem; align-content: center; justify-items: start; }
.skb-split[data-skb-align="center"] .skb-split__copy { justify-items: center; text-align: center; }
.skb-split__media { min-height: 320px; position: relative; }
.skb-split__img { width: 100%; height: 100%; object-fit: cover; display: block; }
.skb-pills { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.skb-pill { border: 1px solid currentColor; border-radius: 999px; padding: 0.35em 0.9em; font-size: 0.85rem; }
.skb-stats { display: flex; flex-wrap: wrap; gap: clamp(1.2rem, 3vw, 2.6rem); margin-block: 0.4rem; }
.skb-stat { display: grid; gap: 0.3rem; border-top: 1.5px solid color-mix(in srgb, currentColor 40%, transparent); padding-top: 0.55rem; min-width: 5.5rem; }
.skb-stat__value { font-family: var(--skb-display-font); font-size: clamp(1.3rem, 2.6vw, 2rem); font-weight: 700; }
.skb-stat__label { font-size: 0.72rem; opacity: 0.75; text-transform: uppercase; letter-spacing: 0.08em; }
.skb-boxes { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.6rem; width: 100%; max-width: 30rem; }
.skb-box { background: var(--skb-tint-1); color: var(--skb-page-ink); border-radius: var(--skb-r-sm); padding: 0.75rem 0.9rem; }
.skb-boxes > :nth-child(2) { background: var(--skb-tint-3); }
.skb-boxes > :nth-child(3) { background: var(--skb-tint-2); }
.skb-box { display: flex; gap: 0.6rem; align-items: flex-start; text-align: left; }
.skb-box__icon { width: 1.25rem; height: 1.25rem; flex: none; margin-top: 0.1rem; }
.skb-box__title { margin: 0; font-weight: 700; font-size: 0.88rem; }
.skb-box__text { margin: 0.15rem 0 0; font-size: 0.8rem; opacity: 0.75; }`,
  hero: `
.skb-hero { display: grid; gap: 2rem; align-items: center; }
@media (min-width: 900px) { .skb-hero { grid-template-columns: 1.1fr 1fr; } }
.skb-hero[data-skb-align="center"] .skb-hero__copy { text-align: center; justify-items: center; }
.skb-hero__copy { display: grid; justify-items: start; gap: 0.2rem; }
.skb-hero__img { width: 100%; height: auto; border-radius: var(--skb-r); display: block; }
.skb-hero__media--full-bleed .skb-hero__img { border-radius: 0; }
.skb-hero__media--stacked { order: -1; }
.skb-hero__media { position: relative; }
.skb-badge { display: inline-block; background: var(--skb-pop); color: var(--skb-pop-ink); font-weight: 700; border-radius: 999px; padding: 0.35em 1em; font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 1rem; }
.skb-note { font-size: 0.85rem; opacity: 0.75; margin: 0.9rem 0 0; }
.skb-trust { font-size: 0.88rem; opacity: 0.85; margin: 0.6rem 0 0; letter-spacing: 0.02em; }`,
  marquee: `
.skb-marquee { overflow: hidden; padding-block: 1.1em; white-space: nowrap; }
.skb-marquee__track { display: inline-flex; animation: skb-scroll var(--skb-marquee-dur, 24s) linear infinite; font-family: var(--skb-display-font); font-size: clamp(1.4rem, 3.2vw, 2.6rem); text-transform: uppercase; letter-spacing: 0.04em; }
.skb-marquee__track span { flex: none; }
@keyframes skb-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }`,
  steps: `
.skb-steps__grid { display: grid; gap: 1.1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.skb-step { background: var(--skb-paper); color: var(--skb-page-ink); border-radius: var(--skb-r); padding: 1.4rem 1.5rem; }
.skb-step__top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.skb-step__icon-wrap { width: 2.6rem; height: 2.6rem; border-radius: 50%; display: grid; place-items: center; background: var(--skb-accent); }
.skb-steps__grid > :nth-child(3n+2) .skb-step__icon-wrap { background: var(--skb-deep); }
.skb-steps__grid > :nth-child(3n) .skb-step__icon-wrap { background: var(--skb-page-ink); }
.skb-step__icon { width: 1.25rem; height: 1.25rem; filter: invert(1); }
.skb-step__number { font-family: var(--skb-display-font); color: var(--skb-accent); font-size: 1.05rem; font-weight: 700; }
.skb-step__title { margin: 0 0 0.35rem; font-size: 1.1rem; }
.skb-step__text { margin: 0; font-size: 0.95rem; opacity: 0.85; }`,
  catalog: `
.skb-list { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
.skb-see { color: inherit; font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; text-decoration-thickness: 2px; text-underline-offset: 4px; white-space: nowrap; }
.skb-card { background: var(--skb-card-tint, color-mix(in srgb, var(--skb-bg) 70%, #ffffff 30%)); color: var(--skb-page-ink); border-radius: var(--skb-r); overflow: hidden; display: flex; flex-direction: column; position: relative; }
.skb-list > :nth-child(3n+1) { --skb-card-tint: var(--skb-tint-1); --skb-card-badge: var(--skb-badge-1, none); }
.skb-list > :nth-child(3n+2) { --skb-card-tint: var(--skb-tint-2); --skb-card-badge: var(--skb-badge-2, none); }
.skb-list > :nth-child(3n) { --skb-card-tint: var(--skb-tint-3); --skb-card-badge: var(--skb-badge-3, none); }
.skb-card::before { content: var(--skb-card-badge, none); position: absolute; top: 0.7rem; left: 0.7rem; z-index: 1; background: var(--skb-paper); color: var(--skb-page-ink); border-radius: 999px; padding: 0.38em 0.9em; font-size: 0.66rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; box-shadow: 0 2px 10px rgba(0,0,0,.14); }
.skb-card__media img { width: 100%; aspect-ratio: var(--skb-card-ratio, 4 / 3); object-fit: cover; display: block; }
[data-skb-card-desc="off"] .skb-card__desc { display: none; }
[data-skb-card-add="off"] .skb-card__add { display: none;  display: flex; justify-content: space-between; align-items: center; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.78rem; }
.skb-card__add::after { content: "+"; font-size: 1.1rem; line-height: 1; }
.skb-card__body { padding: 1rem; display: grid; gap: 0.5rem; }
.skb-card__row { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; }
.skb-card__name { margin: 0; }
.skb-card__price { font-weight: 700; white-space: nowrap; }
.skb-card__add { border: 0; border-radius: var(--skb-btn-r); padding: 0.65em 1.1em; width: 100%; background: var(--skb-page-ink); color: var(--skb-paper); font: inherit; font-weight: 600; cursor: pointer; }
.skb-strip { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-top: 1.5rem; padding: 0.8rem 1.2rem; border-radius: var(--skb-r-sm); background: var(--skb-tint-2); color: var(--skb-page-ink); font-size: 0.85rem; letter-spacing: 0.04em; text-transform: uppercase; }`,
  collections: `
.skb-collections__grid { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.skb-collection { position: relative; display: flex; flex-direction: column; border-radius: var(--skb-r); overflow: hidden; text-decoration: none; color: var(--skb-page-ink); background: var(--skb-tint-1); }
.skb-collections__grid > :nth-child(3n+2) { background: var(--skb-tint-2); }
.skb-collections__grid > :nth-child(3n) { background: var(--skb-tint-3); }
.skb-collection__img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; }
.skb-collection__body { padding: 1.1rem 1.2rem 1.3rem; }
.skb-collection__title { margin: 0 0 0.3rem; font-family: var(--skb-display-font); font-size: 1.3rem; }
.skb-collection__text { margin: 0; font-size: 0.92rem; opacity: 0.85; }
.skb-collection__arrow { position: absolute; right: 0.9rem; bottom: 0.9rem; width: 2rem; height: 2rem; border-radius: 50%; display: grid; place-items: center; background: var(--skb-page-ink); color: var(--skb-paper); font-size: 0.95rem; }`,
  story: `
.skb-story { display: grid; gap: 2rem; align-items: center; }
@media (min-width: 900px) { .skb-story { grid-template-columns: 1fr 1fr; } }
.skb-story__img { width: 100%; height: auto; border-radius: var(--skb-r); display: block; }`,
  reviews: `
.skb-reviews__grid { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
.skb-review { margin: 0; padding: 1.25rem; border-radius: var(--skb-r); background: var(--skb-tint-1); color: var(--skb-page-ink); }
.skb-reviews__grid > :nth-child(3n+2) { background: var(--skb-tint-2); }
.skb-reviews__grid > :nth-child(3n) { background: var(--skb-tint-3); }
.skb-review__stars { margin: 0 0 0.5rem; font-size: 0.85rem; letter-spacing: 0.15em; }
.skb-review blockquote { margin: 0 0 0.6rem; font-size: 1.05rem; font-style: italic; }
.skb-review figcaption { opacity: 0.7; font-size: 0.9rem; display: flex; justify-content: space-between; gap: 0.8rem; }
.skb-review__place { opacity: 0.8; font-size: 0.8rem; }
.skb-rating { text-align: right; }
.skb-rating__value { margin: 0; font-family: var(--skb-display-font); font-size: clamp(1.8rem, 4vw, 3rem); font-weight: 700; line-height: 1; }
.skb-rating__source { margin: 0.25rem 0 0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.7; }
.skb-reviews__photos { display: grid; gap: 0.9rem; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-top: 1.5rem; }
.skb-reviews__photo { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--skb-r-sm); display: block; }
.skb-reviews__handle { margin: 0; aspect-ratio: 1; border-radius: var(--skb-r-sm); display: grid; place-items: center; text-align: center; padding: 0.8rem; background: var(--skb-accent); color: var(--skb-accent-ink); font-family: var(--skb-display-font); font-size: 1.1rem; font-weight: 700; overflow-wrap: anywhere; }`,
  faq: `
.skb-faq__item { border-bottom: 1px solid color-mix(in srgb, var(--skb-ink) 25%, transparent); padding-block: 0.9rem; }
.skb-faq__item summary { cursor: pointer; font-weight: 600; font-size: 1.1rem; }
.skb-faq__item p { margin: 0.6rem 0 0; }`,
  banner: `
.skb-banner { text-align: center; display: grid; gap: 1.6rem; justify-items: center; }
.skb-banner__headline { max-width: 18ch; }
.skb-banner .skb-sticker { top: 1rem; right: clamp(1rem, 8vw, 6rem); }`,
  gallery: `
.skb-gallery__grid { display: grid; gap: clamp(0.7rem, 1.6vw, 1.1rem); grid-auto-flow: column; grid-auto-columns: minmax(150px, 1fr); overflow-x: auto; scrollbar-width: none; }
.skb-gallery__grid::-webkit-scrollbar { display: none; }
.skb-gallery__img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: var(--skb-r-sm); display: block; }`,
  newsletter: `
.skb-newsletter { text-align: center; display: grid; gap: 1rem; justify-items: center; }
.skb-newsletter__grid { display: grid; gap: 2rem; align-items: center; width: 100%; text-align: left; }
@media (min-width: 900px) { .skb-newsletter__grid { grid-template-columns: 1.2fr 1fr; } }
.skb-newsletter__copy { display: grid; gap: 1rem; justify-items: start; }
.skb-newsletter__img { width: 100%; height: auto; border-radius: var(--skb-r); display: block; }
.skb-subscribe-wrap { display: grid; gap: 0.6rem; width: min(100%, 30rem); justify-items: inherit; }
.skb-subscribe { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; width: 100%; padding: 0.35rem 0.35rem 0.35rem 1.2rem; border: 0; cursor: pointer; font: inherit; text-transform: none; letter-spacing: 0; background: var(--skb-paper); color: var(--skb-page-ink); }
.skb-subscribe__field { opacity: 0.6; font-size: 0.95rem; }
.skb-subscribe__submit { background: var(--skb-accent); color: var(--skb-accent-ink); border-radius: var(--skb-btn-r); padding: 0.75em 1.3em; font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
.skb-subscribe__legal { margin: 0; font-size: 0.75rem; opacity: 0.7; }
.skb-subscribe__account { color: inherit; font-size: 0.85rem; font-weight: 600; text-underline-offset: 3px; }
[data-skb-form="stacked"] .skb-subscribe { flex-direction: column; align-items: stretch; padding: 0; background: transparent; color: inherit; gap: 0.5rem; }
[data-skb-form="stacked"] .skb-subscribe__field { background: var(--skb-paper); color: var(--skb-page-ink); opacity: 1; border-radius: var(--skb-r-sm); padding: 0.95em 1.1em; text-align: left; }[data-skb-form="stacked"] .skb-subscribe__submit { padding-block: 1em; text-align: center; }
[data-skb-form="underline"] .skb-subscribe { background: transparent; color: inherit; border-radius: 0; border-bottom: 2px solid currentColor; padding: 0.4rem 0; }
[data-skb-form="underline"] .skb-subscribe__submit { background: transparent; color: inherit; padding: 0.4em 0; }
[data-skb-form="underline"] .skb-subscribe__submit::after { content: " →"; }
[data-skb-form="card"] .skb-subscribe-wrap { background: var(--skb-paper); color: var(--skb-page-ink); border-radius: var(--skb-r); padding: 1.3rem; box-shadow: 0 18px 50px rgba(0,0,0,.12); }
[data-skb-form="card"] .skb-subscribe { background: color-mix(in srgb, var(--skb-page-ink) 6%, var(--skb-paper)); }`,
  footer: `
.skb-footer { padding-bottom: 0; overflow: hidden; }
.skb-footer__grid { display: grid; gap: 1.5rem; align-items: start; }
@media (min-width: 900px) { .skb-footer__grid { grid-template-columns: 1.4fr 1fr 1fr; } }
.skb-footer__name { margin: 0; font-family: var(--skb-display-font); font-size: 1.5rem; font-weight: 700; }
.skb-footer__tagline { margin: 0.4rem 0 0; opacity: 0.85; max-width: 32ch; }
.skb-footer__col-title { margin: 0 0 0.3rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; color: color-mix(in srgb, var(--skb-pop) 70%, var(--skb-ink)); font-weight: 700; }
.skb-footer__links { display: grid; gap: 0.5rem; justify-items: start; }
.skb-footer .pagosya-info-nav { display: grid; gap: 0.5rem; justify-items: start; }
.skb-footer__links a, .skb-footer .pagosya-info-nav a { color: var(--skb-ink); }
.skb-footer__legal-row { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid color-mix(in srgb, currentColor 22%, transparent); }
.skb-footer__legal { margin: 0; font-size: 0.8rem; opacity: 0.6; }
.skb-footer__pay { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.skb-footer__pay span { font-size: 0.66rem; font-weight: 800; letter-spacing: 0.06em; background: var(--skb-ink); color: var(--skb-bg); border-radius: 0.3rem; padding: 0.3em 0.6em; }
.skb-wordmark { font-family: var(--skb-display-font); font-size: clamp(4rem, 18vw, 16rem); line-height: 0.78; margin: 0.5em 0 -0.12em; letter-spacing: -0.02em; font-weight: 700; }`,
};

export const blockCss = (type: SketchBlock['type']) => CSS[type];

export const SKETCH_BASE_CSS = `
.skb-site { --skb-r: 1.25rem; --skb-r-sm: 0.8rem; --skb-btn-r: 999px; }
.skb-site[data-skb-radius="soft"] { --skb-r: 0.6rem; --skb-r-sm: 0.4rem; }
.skb-site[data-skb-radius="square"] { --skb-r: 0; --skb-r-sm: 0; }
.skb-site[data-skb-buttons="square"] { --skb-btn-r: 0.35rem; }
.skb-site[data-skb-buttons="outline"] { --skb-btn-r: 0.35rem; }
.skb-site[data-skb-buttons="outline"] .skb-btn:not(.skb-btn--ghost):not(.skb-subscribe) { background: transparent; color: inherit; border: 2px solid currentColor; }
.skb-site[data-skb-cards="inset"] :is(.skb-card, .skb-collection) { padding: 0.6rem; }
.skb-site[data-skb-cards="inset"] :is(.skb-card__media img, .skb-collection__img) { border-radius: var(--skb-r-sm); }
.skb-site[data-skb-cards="inset"] :is(.skb-card__body, .skb-collection__body) { padding-inline: 0.4rem; }
.skb-site[data-skb-cards="outline"] :is(.skb-card, .skb-collection, .skb-review, .skb-step) { background: transparent; color: inherit; border: 1.5px solid color-mix(in srgb, currentColor 30%, transparent); }
.skb-site[data-skb-header="center"] .skb-header { display: grid; grid-template-columns: 1fr auto 1fr; }
.skb-site[data-skb-header="center"] .skb-logo { grid-column: 2; grid-row: 1; text-align: center; }
.skb-site[data-skb-header="center"] .skb-nav { grid-column: 1; grid-row: 1; }
.skb-site[data-skb-header="center"] .skb-header__actions { grid-column: 3; grid-row: 1; justify-self: end; }
.skb-site[data-skb-footer="center"] .skb-footer__grid { grid-template-columns: 1fr; justify-items: center; text-align: center; }
.skb-site[data-skb-footer="center"] :is(.skb-footer__links, .skb-footer .pagosya-info-nav) { justify-items: center; grid-auto-flow: column; gap: 1.2rem; }
.skb-site[data-skb-footer="center"] .skb-footer__legal-row { justify-content: center; }
.skb-btn:not(.skb-btn--ghost):not(.skb-subscribe)::after { content: " →"; }
.skb[data-skb-align="center"] { text-align: center; }
.skb[data-skb-align="center"] :is(.skb-actions, .skb-pills, .skb-stats, .skb-announce__row) { justify-content: center; }
.skb[data-skb-align="center"] .skb-head { flex-direction: column; align-items: center; }
.skb[data-skb-align="center"] .skb-head__note { text-align: center; }
.skb[data-skb-align="center"] :is(.skb-lead, .skb-banner__headline, .skb-boxes, .skb-subscribe-wrap) { margin-inline: auto; }
.skb[data-skb-align="center"] :is(.skb-hero__copy, .skb-split__copy, .skb-newsletter__copy, .skb-story__copy, .skb-banner__copy, .skb-newsletter__stack) { justify-items: center; }
.skb[data-skb-align="end"] { text-align: right; }
.skb[data-skb-align="end"] :is(.skb-actions, .skb-pills, .skb-stats) { justify-content: flex-end; }
.skb[data-skb-align="end"] .skb-head { flex-direction: row-reverse; }
.skb[data-skb-align="end"] :is(.skb-lead, .skb-boxes, .skb-subscribe-wrap) { margin-left: auto; }
.skb[data-skb-align="end"] :is(.skb-hero__copy, .skb-split__copy, .skb-newsletter__copy, .skb-story__copy, .skb-banner__copy, .skb-newsletter__stack) { justify-items: end; }
@media (min-width: 900px) {
  .skb[data-skb-flip] :is(.skb-hero__media, .skb-split__media, .skb-story__media, .skb-newsletter__media) { order: -1; }
  .skb-hero[data-skb-flip] { grid-template-columns: 1fr 1.1fr; }
  .skb-newsletter[data-skb-flip] .skb-newsletter__grid { grid-template-columns: 1fr 1.2fr; }
}
.skb { background: var(--skb-bg); color: var(--skb-ink); padding-inline: clamp(1rem, 5vw, 4rem); position: relative; }
.skb--s { padding-block: clamp(1.6rem, 3vw, 2.5rem); }
.skb--m { padding-block: clamp(2.6rem, 5vw, 4.5rem); }
.skb--l { padding-block: clamp(4rem, 8vw, 7rem); }
.skb--xl { padding-block: clamp(5.5rem, 11vw, 10rem); }
.skb-display { font-family: var(--skb-display-font); font-size: clamp(2.4rem, 7vw, 5.2rem); line-height: 1.02; margin: 0 0 0.4em; letter-spacing: -0.015em; }
.skb-title { font-family: var(--skb-display-font); font-size: clamp(1.7rem, 4vw, 2.8rem); line-height: 1.08; margin: 0 0 0.6em; }
.skb-kicker { text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.76rem; font-weight: 700; opacity: 0.9; margin: 0 0 0.9em; }
.skb-kicker::before { content: "✦ "; }
.skb-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; flex-wrap: wrap; }
.skb-head__note { margin: 0 0 0.8em; font-size: 0.82rem; line-height: 1.5; opacity: 0.8; max-width: 30ch; text-align: right; }
.skb-photo-tag { position: absolute; left: 0.9rem; bottom: 0.9rem; margin: 0; background: var(--skb-paper); color: var(--skb-page-ink); border-radius: 999px; padding: 0.45em 1em; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; box-shadow: 0 4px 14px rgba(0,0,0,.18); z-index: 1; }
.skb-lead { font-size: clamp(1rem, 1.6vw, 1.2rem); line-height: 1.6; max-width: 62ch; }
.skb-actions { display: flex; gap: 0.7rem; flex-wrap: wrap; align-items: center; }
.skb-btn { display: inline-block; background: var(--skb-ink); color: var(--skb-bg); border-radius: var(--skb-btn-r); padding: 0.95em 1.8em; text-decoration: none; font-weight: 700; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.07em; }
.skb-btn--ghost { background: transparent; color: inherit; border: 1.5px solid currentColor; }
.skb-sticker { position: absolute; top: 1rem; right: 1rem; width: 6.2rem; height: 6.2rem; border-radius: 50%; background: var(--skb-ink); color: var(--skb-bg); display: grid; place-items: center; text-align: center; font-size: 0.72rem; font-weight: 700; padding: 0.6rem; rotate: 8deg; z-index: 1; }
.skb-hero__media .skb-sticker { top: -1.2rem; right: -0.6rem; }
.skb img { max-width: 100%; }
.skb-banner__copy { display: grid; gap: 1.6rem; justify-items: center; }
.skb-newsletter__stack { display: grid; gap: 1rem; justify-items: center; width: 100%; }
[data-skb-group][data-skb-gap="s"] { gap: 0.5rem; }
[data-skb-group][data-skb-gap="m"] { gap: 1.1rem; }
[data-skb-group][data-skb-gap="l"] { gap: 2rem; }
:is(.skb-actions, .skb-pills, .skb-stats, .skb-announce__row)[data-skb-dir="column"] { flex-direction: column; align-items: flex-start; }
.skb-boxes[data-skb-dir="column"] { grid-template-columns: 1fr; }
:is(.skb-actions, .skb-pills, .skb-stats, .skb-announce__row)[data-skb-galign="center"] { justify-content: center; }
:is(.skb-actions, .skb-pills, .skb-stats, .skb-announce__row)[data-skb-galign="end"] { justify-content: flex-end; }
:is(.skb-actions, .skb-pills, .skb-stats, .skb-announce__row)[data-skb-dir="column"][data-skb-galign="center"] { align-items: center; }
:is(.skb-actions, .skb-pills, .skb-stats, .skb-announce__row)[data-skb-dir="column"][data-skb-galign="end"] { align-items: flex-end; }
.skb-boxes[data-skb-galign="center"] { margin-inline: auto; }
.skb-boxes[data-skb-galign="end"] { margin-left: auto; }
[data-skb-group][data-skb-valign="start"] { align-self: start; align-content: start; }
[data-skb-group][data-skb-valign="center"] { align-self: center; align-content: center; }
[data-skb-group][data-skb-valign="end"] { align-self: end; align-content: end; }
@media (max-width: 899px) { [data-skb-group][data-skb-valign] { align-self: auto; } }
@media (prefers-reduced-motion: reduce) { .skb-marquee__track { animation: none; } }
`;
