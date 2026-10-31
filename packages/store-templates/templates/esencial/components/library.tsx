import { useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { Reveal } from '@pagosya/ui';
import { photos, store } from './store-data';
import * as Icons from './icons';

/* Section library (spec 2026-10-31): sections designed and tested once, the way a theme's are. YAPI only picks them, orders
 * them and fills their words and photos (store-data `layout`); it never writes their layout. Each section draws nothing it
 * has no content for, so a block the code let through with a missing part still reads as finished. */

export type LibraryItem = { title: string; text?: string; icon?: string; photo?: string; link?: string; value?: string;
  /** shop-look only: where the pin sits on the photo, in % of its width and height. */
  x?: number; y?: number };
export type LibraryBlock = {
  type: string; look?: string; band?: 'paper' | 'muted' | 'accent' | 'deep';
  eyebrow?: string; title?: string; text?: string; cta?: string; link?: string; cta2?: string; link2?: string;
  photo?: string; photo2?: string; items?: LibraryItem[]; products?: string[]; product?: string; code?: string;
  /** The main grid only: the store's product card (see CardTemplate). */
  card?: string;
  /** promo-countdown only: when the offer the merchant named ends (ISO date); past or missing, the section draws nothing. */
  endsAt?: string;
  /** social-* only: the store's own account (from its links) — its @name and address. */
  handle?: string; social?: string;
};

const ICONS: Record<string, (props: { className?: string }) => ReactElement> = {
  leaf: Icons.IconLeaf, sparkles: Icons.IconSparkles, heart: Icons.IconHeart, droplet: Icons.IconDroplet, sun: Icons.IconSun, gift: Icons.IconGift,
  clock: Icons.IconClock, package: Icons.IconPackage, store: Icons.IconStore, lock: Icons.IconLock, zap: Icons.IconZap, award: Icons.IconAward,
  flame: Icons.IconFlame, sprout: Icons.IconSprout, gem: Icons.IconGem, recycle: Icons.IconRecycle, smile: Icons.IconSmile, badge: Icons.IconBadgeCheck,
  check: Icons.IconCircleCheck, hand: Icons.IconHandHeart, coffee: Icons.IconCoffee, cookie: Icons.IconCookie, shirt: Icons.IconShirt,
  palette: Icons.IconPalette, card: Icons.IconCreditCard, phone: Icons.IconPhone, calendar: Icons.IconCalendar, users: Icons.IconUsers,
  truck: Icons.IconTruck, shield: Icons.IconShieldCheck, star: Icons.IconStar, refresh: Icons.IconRefreshCcw, pin: Icons.IconMapPin,
  message: Icons.IconMessageCircle, mail: Icons.IconMail,
};
export const LIBRARY_ICONS = Object.keys(ICONS);
function Icon({ name, className }: { name?: string; className?: string }) {
  const Draw = ICONS[name ?? ''] ?? Icons.IconSparkles;
  return <Draw className={className} />;
}

/** store-data is written `as const`, so an empty phone types as ''; read it as a plain string. */
const phone: string = String(store.phone ?? '');

/** Where a button goes: the catalogue, a part of the page, a category, a product, or WhatsApp. Nothing else leaves the store. */
function href(link: string | undefined): string {
  if (!link || link === 'products') return 'productos.html';
  if (link.startsWith('#')) return link;
  if (link.startsWith('category:')) return `productos.html?f_categoria=${encodeURIComponent(link.slice(9))}`;
  if (link.startsWith('product:')) return `product.html?id=${encodeURIComponent(link.slice(8))}`;
  if (link === 'whatsapp' && phone) return `https://wa.me/${phone.replace(/\D/g, '')}`;
  return 'productos.html';
}
const external = (link?: string) => link === 'whatsapp';

function Button({ label, link, tone = 'accent' }: { label?: string; link?: string; tone?: 'accent' | 'ghost' | 'light' | 'ink' }) {
  if (!label) return null;
  return <a className={`es-btn es-btn--${tone} lb-btn`} href={href(link)} {...(external(link) ? { target: '_blank', rel: 'noopener' } : {})}>
    {label}<Icons.IconArrowUpRight />
  </a>;
}

function Actions({ block, tone = 'accent', second = 'ghost' }: { block: LibraryBlock; tone?: 'accent' | 'light' | 'ink'; second?: 'ghost' | 'light' }) {
  if (!block.cta && !block.cta2) return null;
  return <div className="es-actions lb-actions"><Button label={block.cta} link={block.link} tone={tone} /><Button label={block.cta2} link={block.link2} tone={second} /></div>;
}

function Photo({ src, className, eager }: { src?: string; className?: string; eager?: boolean }) {
  if (!src) return null;
  return <img className={className} src={src} alt="" aria-hidden="true" loading={eager ? 'eager' : 'lazy'} decoding="async" />;
}

/** A contained section on its band, like the template's own (the band paints past the column to both edges). */
function Band({ block, index, children, className = '', id, extra }: { block: LibraryBlock; index: number; children: ReactNode; className?: string; id?: string; extra?: Record<string, string> }) {
  return <section id={id ?? `lb-${index}`} className={`es-section lb lb-${block.type} ${className}`.trim()} data-lb={block.type} data-lb-look={block.look || undefined}
    data-es-band={block.band || undefined} aria-labelledby={block.title ? `lb-${index}-title` : undefined} {...extra}>{children}</section>;
}

/** Full-bleed sections (covers, photo banners): the whole width, their own colours. */
function Bleed({ block, index, children, className = '', id, extra }: { block: LibraryBlock; index: number; children: ReactNode; className?: string; id?: string; extra?: Record<string, string> }) {
  return <section id={id ?? `lb-${index}`} className={`lb lb-bleed lb-${block.type} ${className}`.trim()} data-lb={block.type} data-lb-look={block.look || undefined}
    data-lb-band={block.band || undefined} aria-labelledby={block.title ? `lb-${index}-title` : undefined} {...extra}>{children}</section>;
}

function Head({ block, index, align = 'start', level = 2, aside }: { block: LibraryBlock; index: number; align?: 'start' | 'center' | 'split'; level?: 1 | 2; aside?: ReactNode }) {
  const Title = level === 1 ? 'h1' : 'h2';
  if (!block.title && !block.eyebrow && !block.text) return null;
  const words = <>
    {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
    {block.title ? <Title id={`lb-${index}-title`} className={level === 1 ? 'es-display lb-title' : 'es-h2 lb-title'}>{block.title}</Title> : null}
  </>;
  if (align === 'split') return <Reveal className="lb-head lb-head--split">
    <div>{words}</div>
    <div className="lb-head__aside">{block.text ? <p className="lb-lede">{block.text}</p> : null}{aside}</div>
  </Reveal>;
  return <Reveal className={`lb-head lb-head--${align}`}>{words}{block.text ? <p className="lb-lede">{block.text}</p> : null}{aside}</Reveal>;
}

/** The store's product card, from the same themes as the sections (owner 2026-10-31: «de tus templates te lleves los product cards
 *  igual»). The kit fills one template per page; the Shell mounts it, so the home, «Ver todo» and the collections show the same card.
 *  classic — Azimuth/Prestige: the photo, the name, the price and a quiet add button.
 *  ribbon  — Palo Alto/Gumdrop: the offer runs along the top of the photo (only when the product has one), bold name, the old price
 *            struck through, «2 colores».
 *  soft    — CHUG/Shapes: a tinted card with a rounded photo and a full «Agregar» pill.
 *  framed  — Shrine Pro: a framed photo, centred name and price, an outline «Agregar al carrito» bar. */
export const LIBRARY_CARDS = ['classic', 'ribbon', 'soft', 'framed'] as const;
export type LibraryCard = typeof LIBRARY_CARDS[number];
export function libraryCard(layout: LibraryBlock[]): LibraryCard {
  const card = layout.find(block => ['products-grid', 'products-tabs', 'products-slider'].includes(block.type))?.card;
  return (LIBRARY_CARDS as readonly string[]).includes(card ?? '') ? card as LibraryCard : 'classic';
}

export function CardTemplate({ card = 'classic' }: { card?: LibraryCard }) {
  const pill = card === 'soft' || card === 'framed';
  return <template data-pagosya-product-template>
    <article className="es-card lb-card" data-lb-card={card}>
      <a className="es-card__media lb-card__media" data-product-link href="product.html">
        <img data-product-field="image" alt="Foto del producto" />
        {card === 'ribbon'
          ? <span className="lb-card__ribbon"><span className="lb-card__ribbon-word" data-product-field="badge" hidden /></span>
          : <span className="lb-card__badge" data-product-field="badge" hidden />}
      </a>
      <div className="lb-card__body">
        <h3 className="es-card__name" data-product-field="name">Producto</h3>
        <p className="lb-card__options" data-product-field="options" hidden />
        <div className="es-card__row">
          <p className="es-card__price" data-product-field="price" />
          <span className="es-card__save" data-product-field="save" hidden />
          {pill ? null : <button type="button" className="es-card__add" data-product-add aria-label="Agregar al carrito"><Icons.IconPlus /></button>}
        </div>
        {pill ? <button type="button" className="lb-card__buy" data-product-add>{card === 'framed' ? 'Agregar al carrito' : 'Agregar'}</button> : null}
      </div>
    </article>
  </template>;
}


/** 34 templates (2026-10-31): the themes' motion, measured on their demos. A section gets data-in when it reaches the screen (each
 *  theme's CSS plays its own entrance from it); a section with data-lb-progress gets --p (0→1 as it scrolls through; pinned ones
 *  through their tall box) and, with data-lb-steps, data-step; the page records the scroll direction (compact headers). Without
 *  motion everything is shown at once and --p is 1. */
export function ThemeMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sections = () => Array.from(document.querySelectorAll<HTMLElement>('main [data-lb]'));
    if (still || !('IntersectionObserver' in window)) { sections().forEach(el => el.setAttribute('data-in', '')); root.setAttribute('data-es-still', ''); return; }
    const seen = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.setAttribute('data-in', ''); seen.unobserve(entry.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    const watchAll = () => sections().forEach(el => { if (!el.hasAttribute('data-in') && !el.hasAttribute('data-watched')) { el.setAttribute('data-watched', ''); seen.observe(el); } });
    watchAll();
    let last = scrollY, queued = false;
    const frame = () => {
      queued = false;
      const vh = innerHeight;
      document.querySelectorAll<HTMLElement>('[data-lb-progress]').forEach(el => {
        const box = el.getBoundingClientRect();
        const pinned = el.hasAttribute('data-lb-pinned');
        const p = pinned ? -box.top / Math.max(1, box.height - vh) : (vh - box.top) / (vh + box.height);
        const value = Math.min(1, Math.max(0, p));
        el.style.setProperty('--p', value.toFixed(4));
        const steps = Number(el.getAttribute('data-lb-steps'));
        if (steps > 1) el.setAttribute('data-step', String(Math.min(steps - 1, Math.floor(value * steps))));
      });
      const y = scrollY;
      root.setAttribute('data-es-scroll', y < 80 ? 'top' : y > last + 4 ? 'down' : y < last - 4 ? 'up' : root.getAttribute('data-es-scroll') ?? 'top');
      last = y;
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
    const late = new MutationObserver(watchAll);
    late.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    frame();
    return () => { seen.disconnect(); late.disconnect(); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);
  return null;
}

/** The ribbon card's offer runs along the photo: the kit writes it once, this repeats it into a moving strip. */
export function CardRibbons() {
  useEffect(() => {
    const fill = () => document.querySelectorAll<HTMLElement>('.lb-card__ribbon:not([data-run])').forEach(ribbon => {
      // The template's own copy stays untouched: every card is cloned from it (React draws template children in the element).
      if (ribbon.closest('template')) return;
      const word = ribbon.querySelector<HTMLElement>('.lb-card__ribbon-word');
      const text = word && !word.hidden ? (word.textContent ?? '').trim() : '';
      if (!text) { if (word?.hidden) ribbon.setAttribute('data-empty', ''); return; }
      ribbon.setAttribute('data-run', '');
      const run = document.createElement('span');
      run.className = 'lb-card__ribbon-run';
      run.setAttribute('aria-hidden', 'true');
      run.textContent = Array.from({ length: 8 }, () => text).join('   ·   ');
      ribbon.append(run, run.cloneNode(true));
    });
    const watch = new MutationObserver(fill);
    watch.observe(document.body, { childList: true, subtree: true });
    fill();
    return () => watch.disconnect();
  }, []);
  return null;
}

/* ---------------------------------------------------------------- covers */

function CoverSplit({ block, index }: { block: LibraryBlock; index: number }) {
  const points = (block.items ?? []).slice(0, 3);
  return <Bleed block={block} index={index} id="inicio" className="lb-cover">
    <div className="lb-cover-split__inner">
      <div className="lb-cover-split__copy">
        <Head block={{ ...block, text: undefined }} index={index} level={1} />
        {block.text ? <p className="lb-cover__sub">{block.text}</p> : null}
        {points.length ? <ul className="lb-points">{points.map((point, at) => <li key={at}><Icon name={point.icon || 'check'} className="lb-points__icon" /><div><strong>{point.title}</strong>{point.text ? <span>{point.text}</span> : null}</div></li>)}</ul> : null}
        <Actions block={block} />
      </div>
      <div className="lb-cover-split__media"><Photo src={block.photo} eager /></div>
    </div>
  </Bleed>;
}

function CoverFull({ block, index }: { block: LibraryBlock; index: number }) {
  return <Bleed block={block} index={index} id="inicio" className="lb-cover lb-cover--dark">
    <Photo src={block.photo} className="lb-cover-full__photo" eager />
    <div className="lb-cover-full__copy">
      <Head block={{ ...block, text: undefined }} index={index} level={1} />
      {block.text ? <p className="lb-cover__sub">{block.text}</p> : null}
      <Actions block={block} tone="light" second="ghost" />
    </div>
  </Bleed>;
}

function CoverPoster({ block, index }: { block: LibraryBlock; index: number }) {
  return <Bleed block={block} index={index} id="inicio" className="lb-cover">
    <div className="lb-cover-poster__inner">
      {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
      <h1 id={`lb-${index}-title`} className="lb-cover-poster__word" data-lb-fit>{block.title}</h1>
      <div className="lb-cover-poster__stage">
        <div className="lb-cover-poster__frame"><Photo src={block.photo} eager /></div>
        <div className="lb-cover-poster__side">
          {block.text ? <p className="lb-cover__sub">{block.text}</p> : null}
          <Actions block={block} />
        </div>
      </div>
    </div>
  </Bleed>;
}

function CoverHalf({ block, index }: { block: LibraryBlock; index: number }) {
  return <Bleed block={block} index={index} id="inicio" className="lb-cover">
    <div className="lb-cover-half__inner">
      <div className="lb-cover-half__media"><Photo src={block.photo} eager /></div>
      <div className="lb-cover-half__panel">
        <Head block={{ ...block, text: undefined }} index={index} level={1} align="center" />
        {block.text ? <p className="lb-cover__sub">{block.text}</p> : null}
        {block.code ? <p className="lb-code-chip">Código <strong>{block.code}</strong></p> : null}
        <Actions block={block} />
      </div>
    </div>
  </Bleed>;
}

function CoverCentered({ block, index }: { block: LibraryBlock; index: number }) {
  return <Bleed block={block} index={index} id="inicio" className="lb-cover">
    <div className="lb-cover-centered__copy">
      <Head block={{ ...block, text: undefined }} index={index} level={1} align="center" />
      {block.text ? <p className="lb-cover__sub">{block.text}</p> : null}
      <Actions block={block} />
    </div>
    <div className="lb-cover-centered__media"><Photo src={block.photo} eager /></div>
  </Bleed>;
}

function CoverRibbon({ block, index }: { block: LibraryBlock; index: number }) {
  const words = (block.items ?? []).map(item => item.title).filter(Boolean);
  const line = (words.length ? words : [store.name]).join('  ✦  ');
  const ribbon = `${line}  ✦  `.repeat(6);
  return <Bleed block={block} index={index} id="inicio" className="lb-cover">
    <div className="lb-cover-ribbon__inner">
      <div className="lb-cover-ribbon__copy">
        <Head block={{ ...block, text: undefined }} index={index} level={1} />
        {block.text ? <p className="lb-cover__sub">{block.text}</p> : null}
        <Actions block={block} tone="ink" />
      </div>
      <div className="lb-cover-ribbon__media"><Photo src={block.photo} eager /></div>
    </div>
    <svg className="lb-ribbon" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true">
      <path id={`lb-${index}-curve`} d="M-40,150 C320,40 560,40 760,110 S1180,190 1480,60" fill="none" />
      <path className="lb-ribbon__band" d="M-40,150 C320,40 560,40 760,110 S1180,190 1480,60" />
      <text className="lb-ribbon__text"><textPath href={`#lb-${index}-curve`} startOffset="0">{ribbon}<animate attributeName="startOffset" from="0%" to="-50%" dur="40s" repeatCount="indefinite" /></textPath></text>
    </svg>
  </Bleed>;
}

/* ---------------------------------------------------------------- strips */

function StripMarquee({ block, index }: { block: LibraryBlock; index: number }) {
  const words = (block.items ?? []).map(item => item.title).filter(Boolean);
  if (words.length < 2) return null;
  const run = (key: number) => <span key={key} className="lb-marquee__run">{[0, 1].flatMap(round => words.map((word, at) => <span key={`${round}-${at}`}>{word}<i aria-hidden="true">✦</i></span>))}</span>;
  return <div id={`lb-${index}`} className="lb lb-strip-marquee" data-lb="strip-marquee" data-lb-look={block.look || 'solid'} aria-label={words.join(', ')}>
    <p className="lb-marquee__track" aria-hidden="true">{[0, 1].map(run)}</p>
  </div>;
}

function StripServices({ block, index }: { block: LibraryBlock; index: number }) {
  const items = (block.items ?? []).slice(0, 4);
  if (items.length < 2) return null;
  return <Band block={{ ...block, band: block.band ?? 'muted' }} index={index}>
    <ul className="lb-services" data-count={items.length}>{items.map((item, at) => <li key={at}><Reveal delay={at * 80}>
      <span className="lb-services__icon"><Icon name={item.icon || 'truck'} /></span>
      <h3 className="lb-services__title">{item.title}</h3>{item.text ? <p>{item.text}</p> : null}
    </Reveal></li>)}</ul>
  </Band>;
}

function StripBadges({ block, index }: { block: LibraryBlock; index: number }) {
  const items = (block.items ?? []).slice(0, 6);
  if (items.length < 3) return null;
  return <Band block={{ ...block, band: block.band ?? 'muted' }} index={index}>
    <Head block={block} index={index} align="center" />
    <ul className="lb-badges">{items.map((item, at) => <li key={at}><Reveal delay={at * 60}><span className="lb-badges__ring"><Icon name={item.icon} /></span><span className="lb-badges__label">{item.title}</span></Reveal></li>)}</ul>
  </Band>;
}

/* ---------------------------------------------------------------- products */

function ProductsGrid({ block, index }: { block: LibraryBlock; index: number }) {
  const tabs = block.type === 'products-tabs';
  return <Band block={block} index={index} id="productos">
    {tabs ? <Head block={block} index={index} align="center" aside={<div className="lb-tabs" data-pagosya-categories hidden />} />
      : <Head block={block} index={index} align="split" aside={<a className="es-link" href="productos.html">{block.cta || 'Ver todo'} <Icons.IconArrowRight /></a>} />}
    <div className="es-grid lb-grid" data-es-grid={block.look === 'grid3' ? 'grid3' : 'grid4'} data-pagosya-catalog data-catalog-limit={block.look === 'grid3' ? 6 : 8} data-pagosya-filters data-filters-style="chips" />
    {tabs ? <p className="lb-more"><a className="es-btn es-btn--ghost" href="productos.html">{block.cta || 'Ver todos los productos'}</a></p> : null}
  </Band>;
}

function ProductsSpotlight({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.product) return null;
  const points = (block.items ?? []).slice(0, 3);
  return <Band block={block} index={index}>
    <div className="lb-spotlight">
      <Reveal className="lb-spotlight__words">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title">{block.title}</h2> : null}
        {block.text ? <p className="lb-lede">{block.text}</p> : null}
        {points.length ? <ul className="lb-points lb-points--plain">{points.map((point, at) => <li key={at}><Icon name={point.icon || 'check'} className="lb-points__icon" /><div><strong>{point.title}</strong>{point.text ? <span>{point.text}</span> : null}</div></li>)}</ul> : null}
      </Reveal>
      <div className="lb-spotlight__card" data-pagosya-spotlight={block.product} data-side="right" />
    </div>
  </Band>;
}

function ProductsCards({ block, index }: { block: LibraryBlock; index: number }) {
  const names = (block.products ?? []).slice(0, 4);
  if (!names.length) return null;
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="center" />
    <div className="es-grid lb-cards" data-es-grid={names.length === 3 ? 'grid3' : 'grid4'} data-count={names.length} data-pagosya-catalog data-products={names.join('|')} />
    {block.cta ? <p className="lb-more"><Button label={block.cta} link={block.link} /></p> : null}
  </Band>;
}

function ProductsLookbook({ block, index }: { block: LibraryBlock; index: number }) {
  const names = (block.products ?? []).slice(0, 3);
  if (!block.photo || !names.length) return null;
  return <Band block={block} index={index}>
    <div className="lb-lookbook" data-count={names.length}>
      <figure className="lb-lookbook__photo">
        <Photo src={block.photo} />
        <figcaption>
          {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
          {block.title ? <h2 id={`lb-${index}-title`} className="lb-lookbook__title">{block.title}</h2> : null}
          <Button label={block.cta} link={block.link} tone="light" />
        </figcaption>
      </figure>
      <div className="lb-lookbook__products" data-pagosya-catalog data-products={names.join('|')} />
    </div>
  </Band>;
}

function CategoriesTiles({ block, index }: { block: LibraryBlock; index: number }) {
  const tiles = (block.items ?? []).filter(item => item.photo).slice(0, 4);
  if (tiles.length < 2) return null;
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="center" />
    <ul className="lb-tiles" data-count={tiles.length}>{tiles.map((tile, at) => <li key={at}><Reveal delay={at * 70}>
      <a className="lb-tiles__tile" href={href(tile.link)}>
        <Photo src={tile.photo} />
        <span className="lb-tiles__label"><span>{tile.title}{tile.text ? <small className="lb-tiles__sub">{tile.text}</small> : null}</span><Icons.IconArrowRight /></span>
      </a>
    </Reveal></li>)}</ul>
  </Band>;
}

/* ---------------------------------------------------------------- story */

function StorySplit({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.photo) return null;
  return <Band block={block} index={index}>
    <div className="lb-split" data-side={block.look === 'right' ? 'right' : 'left'}>
      <Reveal className="lb-split__media"><Photo src={block.photo} /></Reveal>
      <Reveal className="lb-split__copy" delay={120}>
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title">{block.title}</h2> : null}
        {block.photo2 ? <Photo src={block.photo2} className="lb-split__inset" /> : null}
        {block.text ? <p className="lb-body">{block.text}</p> : null}
        <Actions block={block} />
      </Reveal>
    </div>
  </Band>;
}

function StoryChecker({ block, index }: { block: LibraryBlock; index: number }) {
  const [first, second] = block.items ?? [];
  if (!block.photo || !block.photo2 || !first || !second) return null;
  const tile = (item: LibraryItem, tone: string, at: number) => <Reveal className="lb-checker__tile" delay={at * 90}>
    <div data-tone={tone}><p className="lb-checker__n">{String(at + 1).padStart(2, '0')}</p><h3 className="lb-checker__title">{item.title}</h3>{item.text ? <p>{item.text}</p> : null}</div>
  </Reveal>;
  return <Bleed block={block} index={index}>
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden">{block.title}</h2> : null}
    <div className="lb-checker">
      {tile(first, 'deep', 0)}<div className="lb-checker__photo"><Photo src={block.photo} /></div>
      <div className="lb-checker__photo"><Photo src={block.photo2} /></div>{tile(second, 'accent', 1)}
    </div>
  </Bleed>;
}

function StoryOverlay({ block, index }: { block: LibraryBlock; index: number }) {
  const items = (block.items ?? []).slice(0, 3);
  if (!block.photo) return null;
  return <Bleed block={block} index={index} className="lb-cover--dark">
    <Photo src={block.photo} className="lb-overlay__photo" />
    <div className="lb-overlay__inner">
      <Reveal className="lb-overlay__head">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title">{block.title}</h2> : null}
        {block.text ? <p className="lb-lede">{block.text}</p> : null}
      </Reveal>
      {items.length ? <ul className="lb-overlay__cols">{items.map((item, at) => <li key={at}><Reveal delay={at * 90}><h3>{item.title}</h3>{item.text ? <p>{item.text}</p> : null}</Reveal></li>)}</ul> : null}
    </div>
  </Bleed>;
}

function StoryList({ block, index }: { block: LibraryBlock; index: number }) {
  const items = (block.items ?? []).slice(0, 4);
  if (!block.photo || items.length < 2) return null;
  return <Band block={block} index={index}>
    <div className="lb-list">
      <Reveal className="lb-list__copy">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title">{block.title}</h2> : null}
        <ol className="lb-list__items">{items.map((item, at) => <li key={at}><span className="lb-list__n">{String(at + 1).padStart(2, '0')}</span><div><h3>{item.title}</h3>{item.text ? <p>{item.text}</p> : null}</div></li>)}</ol>
        <Actions block={block} />
      </Reveal>
      <Reveal className="lb-list__media" delay={120}><Photo src={block.photo} /></Reveal>
    </div>
  </Band>;
}

function StatementInline({ block, index }: { block: LibraryBlock; index: number }) {
  const words = (block.title ?? '').split(/\s+/).filter(Boolean);
  if (words.length < 4 || !block.photo) return null;
  const first = Math.max(1, Math.round(words.length / 3)), second = Math.max(first + 1, Math.round(words.length * 2 / 3));
  const chip = (src?: string) => src ? <span className="lb-statement__chip"><img src={src} alt="" aria-hidden="true" loading="lazy" /></span> : null;
  return <Band block={{ ...block, band: block.band ?? 'muted' }} index={index}>
    <Reveal className="lb-statement">
      {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
      <h2 id={`lb-${index}-title`} className="lb-statement__text">
        {words.slice(0, first).join(' ')} {chip(block.photo)} {words.slice(first, second).join(' ')} {chip(block.photo2)} {words.slice(second).join(' ')}
      </h2>
      {block.text ? <p className="lb-lede">{block.text}</p> : null}
      <Actions block={block} />
    </Reveal>
  </Band>;
}

/* ---------------------------------------------------------------- benefits */

function BenefitsOrbit({ block, index }: { block: LibraryBlock; index: number }) {
  const items = (block.items ?? []).slice(0, 4);
  if (!block.photo || items.length < 2) return null;
  const half = Math.ceil(items.length / 2);
  const column = (list: LibraryItem[], side: string) => <ul className={`lb-orbit__col lb-orbit__col--${side}`}>{list.map((item, at) => <li key={at}><Reveal delay={at * 90}>
    <span className="lb-orbit__icon"><Icon name={item.icon} /></span><h3>{item.title}</h3>{item.text ? <p>{item.text}</p> : null}
  </Reveal></li>)}</ul>;
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="center" />
    <div className="lb-orbit">
      {column(items.slice(0, half), 'start')}
      <Reveal className="lb-orbit__photo"><Photo src={block.photo} /></Reveal>
      {column(items.slice(half), 'end')}
    </div>
  </Band>;
}

function BenefitsBento({ block, index }: { block: LibraryBlock; index: number }) {
  const items = (block.items ?? []).slice(0, 3);
  if (!block.photo || items.length < 2) return null;
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="split" />
    <div className="lb-bento" data-count={items.length}>
      <Reveal className="lb-bento__photo"><Photo src={block.photo} /></Reveal>
      {items.map((item, at) => <Reveal key={at} className="lb-bento__card" delay={(at + 1) * 80}>
        <div data-tone={['muted', 'accent', 'paper'][at]}><span className="lb-bento__icon"><Icon name={item.icon} /></span><h3>{item.title}</h3>{item.text ? <p>{item.text}</p> : null}</div>
      </Reveal>)}
    </div>
  </Band>;
}

function CompareTable({ block, index }: { block: LibraryBlock; index: number }) {
  const rows = (block.items ?? []).slice(0, 6);
  if (rows.length < 3) return null;
  const mark = (yes: boolean) => yes ? <Icons.IconCircleCheck className="lb-compare__yes" /> : <Icons.IconCircleX className="lb-compare__no" />;
  return <Band block={block} index={index}>
    <div className="lb-compare">
      <Reveal className="lb-compare__copy">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title">{block.title}</h2> : null}
        {block.text ? <p className="lb-lede">{block.text}</p> : null}
        <Photo src={block.photo} className="lb-compare__photo" />
        <Actions block={block} />
      </Reveal>
      <Reveal className="lb-compare__table" delay={120}>
        <table>
          <thead><tr><th scope="col"><span className="lb-visually-hidden">Comparación</span></th><th scope="col" className="lb-compare__us">{store.name}</th><th scope="col">{block.cta2 || 'Otros'}</th></tr></thead>
          <tbody>{rows.map((row, at) => <tr key={at}><th scope="row">{row.title}</th><td className="lb-compare__us">{mark(true)}</td><td>{mark(row.value === 'yes')}</td></tr>)}</tbody>
        </table>
      </Reveal>
    </div>
  </Band>;
}

function StepsHowto({ block, index }: { block: LibraryBlock; index: number }) {
  const steps = (block.items ?? []).slice(0, 4);
  if (steps.length < 2) return null;
  return <Band block={block} index={index}>
    <div className={block.photo ? 'lb-steps lb-steps--photo' : 'lb-steps'}>
      {block.photo ? <Reveal className="lb-steps__media"><Photo src={block.photo} /></Reveal> : null}
      <div>
        <Head block={block} index={index} />
        <ol className="lb-steps__list" data-count={steps.length}>{steps.map((step, at) => <li key={at}><Reveal delay={at * 90}>
          <span className="lb-steps__n">{at + 1}</span><h3>{step.title}</h3>{step.text ? <p>{step.text}</p> : null}
        </Reveal></li>)}</ol>
        <Actions block={block} />
      </div>
    </div>
  </Band>;
}

function Usecases({ block, index }: { block: LibraryBlock; index: number }) {
  const cases = (block.items ?? []).filter(item => item.photo).slice(0, 2);
  if (cases.length < 2) return null;
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="center" />
    <ul className="lb-cases">{cases.map((item, at) => <li key={at}><Reveal delay={at * 100}>
      <div className="lb-cases__photo"><Photo src={item.photo} /></div>
      <h3>{item.title}</h3>{item.text ? <p>{item.text}</p> : null}
    </Reveal></li>)}</ul>
  </Band>;
}

/* ---------------------------------------------------------------- proof */

function Reviews({ block, index }: { block: LibraryBlock; index: number }) {
  const wall = block.type === 'reviews-wall';
  return <section id={`lb-${index}`} className={`es-section lb lb-${block.type}`} data-lb={block.type} data-es-band={block.band || undefined} data-pagosya-reviews-section aria-labelledby={`lb-${index}-title`}>
    <Head block={{ ...block, title: block.title || 'Lo que dicen nuestros clientes' }} index={index} align="center" />
    <div className={wall ? 'lb-reviews lb-reviews--wall' : 'lb-reviews lb-reviews--cards'} data-pagosya-reviews />
  </section>;
}

/* ---------------------------------------------------------------- promo */

function PromoCode({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.code) return null;
  return <Band block={{ ...block, band: block.band ?? 'muted' }} index={index} className="lb-promo-code-band">
    <Reveal className={block.photo ? 'lb-promo lb-promo--photo' : 'lb-promo'}>
      <Photo src={block.photo} className="lb-promo__photo" />
      <div className="lb-promo__words">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h2 id={`lb-${index}-title`} className="lb-promo__title">{block.title}</h2> : null}
        {block.text ? <p>{block.text}</p> : null}
      </div>
      <div className="lb-promo__code">
        <button type="button" className="lb-promo__chip" data-lb-copy={block.code} aria-label={`Copiar el código ${block.code}`}>
          <span>{block.code}</span><Icons.IconCopy />
        </button>
        <Button label={block.cta || 'Comprar ahora'} link={block.link} />
      </div>
    </Reveal>
  </Band>;
}

function PromoPair({ block, index }: { block: LibraryBlock; index: number }) {
  const tiles = (block.items ?? []).filter(item => item.photo).slice(0, 2);
  if (tiles.length < 2) return null;
  return <Band block={block} index={index}>
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden">{block.title}</h2> : null}
    <ul className="lb-pair">{tiles.map((tile, at) => <li key={at}><Reveal delay={at * 100}>
      <a className="lb-pair__tile" href={href(tile.link)}>
        <Photo src={tile.photo} />
        <span className="lb-pair__words">{tile.text ? <span className="lb-pair__kicker">{tile.text}</span> : null}<span className="lb-pair__title">{tile.title}</span><span className="lb-pair__go">{block.cta || 'Ver más'} <Icons.IconArrowRight /></span></span>
      </a>
    </Reveal></li>)}</ul>
  </Band>;
}

function PromoBanner({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.photo) return null;
  return <Bleed block={block} index={index} className="lb-cover--dark">
    <Photo src={block.photo} className="lb-banner__photo" />
    <Reveal className="lb-banner__copy">
      {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
      {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title">{block.title}</h2> : null}
      {block.text ? <p className="lb-lede">{block.text}</p> : null}
      <Actions block={block} tone="light" />
    </Reveal>
  </Bleed>;
}

/* ---------------------------------------------------------------- info */

function FaqSplit({ block, index }: { block: LibraryBlock; index: number }) {
  const items = (block.items ?? []).slice(0, 8);
  if (items.length < 2) return null;
  return <Band block={block} index={index} id="preguntas">
    <div className="lb-faq">
      <Reveal className="lb-faq__copy">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        <h2 id={`lb-${index}-title`} className="es-h2 lb-title">{block.title || 'Preguntas frecuentes'}</h2>
        {block.text ? <p className="lb-lede">{block.text}</p> : null}
        <Photo src={block.photo} className="lb-faq__photo" />
        {phone ? <Button label={block.cta || 'Escríbenos'} link="whatsapp" tone="ghost" /> : null}
      </Reveal>
      <div className="lb-faq__list">{items.map((item, at) => <details key={at} className="lb-faq__item" open={at === 0}>
        <summary><span>{item.title}</span><Icons.IconPlus /></summary>
        {item.text ? <p>{item.text}</p> : null}
      </details>)}</div>
    </div>
  </Band>;
}

function VisitStore({ block, index }: { block: LibraryBlock; index: number }) {
  const rows = (block.items ?? []).slice(0, 4);
  if (!rows.length) return null;
  return <Band block={block} index={index}>
    <div className={block.photo ? 'lb-visit' : 'lb-visit lb-visit--plain'}>
      {block.photo ? <Reveal className="lb-visit__media"><Photo src={block.photo} /></Reveal> : null}
      <Reveal className="lb-visit__card" delay={120}>
        <p className="es-eyebrow lb-eyebrow">{block.eyebrow || 'Visítanos'}</p>
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title">{block.title}</h2> : null}
        {block.text ? <p className="lb-lede">{block.text}</p> : null}
        <dl className="lb-visit__rows">{rows.map((row, at) => <div key={at}><dt><Icon name={row.icon || (at === 0 ? 'pin' : 'clock')} />{row.title}</dt><dd>{row.text}</dd></div>)}</dl>
        {phone ? <Button label={block.cta || 'Escríbenos por WhatsApp'} link="whatsapp" /> : null}
      </Reveal>
    </div>
  </Band>;
}

/* ---------------------------------------------------------------- closing */

function ClosingPhoto({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.photo) return null;
  return <Bleed block={block} index={index} id="cierre" className="lb-cover--dark">
    <Photo src={block.photo} className="lb-banner__photo" />
    <Reveal className="lb-banner__copy lb-banner__copy--center">
      {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
      {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title">{block.title}</h2> : null}
      {block.text ? <p className="lb-lede">{block.text}</p> : null}
      <Actions block={block} tone="light" />
    </Reveal>
  </Bleed>;
}

function ClosingWordmark({ block, index }: { block: LibraryBlock; index: number }) {
  return <Bleed block={block} index={index} id="cierre">
    <div className="lb-wordmark__top">
      {block.photo ? <Reveal className="lb-wordmark__photo"><Photo src={block.photo} /></Reveal> : null}
      <Reveal className="lb-wordmark__copy" delay={100}>
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title">{block.title}</h2> : null}
        {block.text ? <p className="lb-lede">{block.text}</p> : null}
        <Actions block={block} />
      </Reveal>
    </div>
    <p className="lb-wordmark__word" aria-hidden="true" data-lb-fit>{store.name}</p>
  </Bleed>;
}


/* ---------------------------------------------------------------- 34 templates (2026-10-31): parts the themes carry */

/** Palo Alto: a thin note under the header («Loved by over 10,000 customers since 2016»), in the theme's small type. */
function BarNote({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.title) return null;
  return <div id={`lb-${index}`} className="lb lb-bar-note" data-lb="bar-note"><p>{block.title}</p></div>;
}

/** Palo Alto, Impulse: the photo is the page; the words sit centre-left, one word underlined by hand, the buttons stacked full width.
 *  With item photos it becomes a slow crossfade of up to three slides (the words stay). */
function CoverStage({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.photo) return null;
  const slides = [block.photo, ...(block.items ?? []).map(item => item.photo).filter((src): src is string => Boolean(src))].slice(0, 3);
  const [first, ...rest] = (block.title ?? '').split(' ');
  return <Bleed block={block} index={index} id="inicio" className="lb-cover lb-cover--dark">
    <div className="lb-stage__slides" data-count={slides.length}>{slides.map((src, at) => <Photo key={at} src={src} className="lb-stage__photo" eager={at === 0} />)}</div>
    <div className="lb-stage__copy">
      {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
      <h1 id={`lb-${index}-title`} className="lb-stage__title"><span className="lb-mark">{first}<svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true"><path d="M3 14c40-8 90-11 194-6" /></svg></span>{rest.length ? ` ${rest.join(' ')}` : ''}</h1>
      {block.text ? <p className="lb-cover__sub">{block.text}</p> : null}
      {block.cta || block.cta2 ? <div className="lb-stage__buttons">
        {block.cta ? <a className="lb-stage__btn" href={href(block.link)}>{block.cta}</a> : null}
        {block.cta2 ? <a className="lb-stage__btn lb-stage__btn--solid" href={href(block.link2)}>{block.cta2}</a> : null}
      </div> : null}
    </div>
  </Bleed>;
}

/** Palo Alto «Shop before it ends»: the merchant's offer and the time left, to a date they gave. Nothing when the date has passed. */
function PromoCountdown({ block, index }: { block: LibraryBlock; index: number }) {
  const end = Date.parse(block.endsAt ?? '');
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!Number.isFinite(end)) return;
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [end]);
  if (!Number.isFinite(end) || left === 0 || !block.title) return null;
  const ms = left ?? Math.max(0, end - Date.now());
  const parts: Array<[number, string]> = [[Math.floor(ms / 86_400_000), 'Días'], [Math.floor(ms / 3_600_000) % 24, 'Horas'], [Math.floor(ms / 60_000) % 60, 'Minutos'], [Math.floor(ms / 1000) % 60, 'Segundos']];
  return <Band block={{ ...block, band: block.band ?? 'muted' }} index={index}>
    <div className="lb-countdown">
      <div className="lb-countdown__words">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        <h2 id={`lb-${index}-title`} className="lb-countdown__title">{block.title}</h2>
        {block.cta ? <a className="lb-underline-link" href={href(block.link)}>{block.cta}</a> : null}
      </div>
      <ol className="lb-countdown__clock" aria-label="Tiempo que queda">{parts.map(([value, label]) => <li key={label}><span className="lb-countdown__n">{String(value).padStart(2, '0')}</span><span className="lb-countdown__unit">{label}</span></li>)}</ol>
    </div>
  </Band>;
}

/** Palo Alto «Designed to empower»: two or three lines of words scroll past while their photos stay pinned beside them, each photo
 *  rising over the last as its line arrives (measured on the demo: the media column is sticky; steps follow the scroll). */
function StoryStack({ block, index }: { block: LibraryBlock; index: number }) {
  const rows = (block.items ?? []).filter(item => item.photo && item.title).slice(0, 3);
  if (rows.length < 2) return null;
  return <Band block={block} index={index} extra={{ 'data-lb-progress': '', 'data-lb-pinned': '', 'data-lb-steps': String(rows.length) }}>
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden">{block.title}</h2> : null}
    <div className="lb-stack" data-count={rows.length}>
      <div className="lb-stack__lines">{rows.map((row, at) => <div key={at} className="lb-stack__row">
        <p className="lb-stack__line">{row.title}</p>{row.text ? <p className="lb-stack__text">{row.text}</p> : null}
        {row.link || block.cta ? <a className="es-btn es-btn--ink lb-btn lb-stack__btn" href={href(row.link ?? block.link)}>{block.cta || 'Ver más'}</a> : null}
        <figure className="lb-stack__inline"><Photo src={row.photo} /></figure>
      </div>)}</div>
      <div className="lb-stack__media" aria-hidden="true">{rows.map((row, at) => <figure key={at} className="lb-stack__photo"><Photo src={row.photo} /></figure>)}</div>
    </div>
  </Band>;
}

/** Palo Alto: one paragraph in large type, pinned while its words light up one by one with the scroll; a phrase the copy marks
 *  with *asterisks* gets a hand-drawn underline. Fully lit and still without motion. */
function StatementReveal({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.text) return null;
  const words: Array<{ word: string; marked: boolean; tail?: string }> = [];
  block.text.split('*').forEach((part, at) => {
    const parts = part.split(' ');
    // Punctuation right after a marked phrase («*moderna*.») joins its last word instead of standing alone.
    if (at % 2 === 0 && at > 0 && parts[0] && words.length) { words[words.length - 1] = { ...words[words.length - 1], tail: parts[0] }; parts.shift(); }
    parts.filter(Boolean).forEach(word => words.push({ word, marked: at % 2 === 1 }));
  });
  return <Band block={block} index={index} extra={{ 'data-lb-progress': '', 'data-lb-pinned': '' }}>
    <div className="lb-reveal__pin">
      <div className="lb-reveal" style={{ ['--n' as string]: words.length } as CSSProperties}>
        <span className="lb-reveal__dots" aria-hidden="true">•••</span>
        {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden">{block.title}</h2> : null}
        <p className="lb-reveal__text">{words.map((entry, at) => <span key={at}><span className={entry.marked ? 'lb-reveal__word lb-reveal__marked' : 'lb-reveal__word'} style={{ ['--i' as string]: at } as CSSProperties}>{entry.word}</span>{entry.tail ? <span className="lb-reveal__word" style={{ ['--i' as string]: at } as CSSProperties}>{entry.tail}</span> : null}{' '}</span>)}</p>
        {block.cta ? <a className="es-btn es-btn--ghost lb-btn" href={href(block.link)}>{block.cta}</a> : null}
      </div>
    </div>
  </Band>;
}

/** Palo Alto «The Edits»: the categories as a list; the one under the pointer (or focused) shows its photo beside it. */
function CategoriesList({ block, index }: { block: LibraryBlock; index: number }) {
  const rows = (block.items ?? []).filter(item => item.title).slice(0, 6);
  const [active, setActive] = useState(0);
  if (rows.length < 2) return null;
  const photo = rows[active]?.photo ?? rows.find(row => row.photo)?.photo ?? block.photo;
  return <Band block={{ ...block, band: block.band ?? 'muted' }} index={index}>
    <div className="lb-edits">
      <div className="lb-edits__words">
        {block.title ? <h2 id={`lb-${index}-title`} className="lb-edits__title">{block.title}</h2> : null}
        {block.text ? <p className="lb-lede">{block.text}</p> : null}
        <ul className="lb-edits__list">{rows.map((row, at) => <li key={at}><a href={href(row.link)} data-active={at === active ? '' : undefined} onMouseEnter={() => setActive(at)} onFocus={() => setActive(at)}>{row.title}</a></li>)}</ul>
      </div>
      {photo ? <figure className="lb-edits__photo"><img key={photo} src={photo} alt="" aria-hidden="true" loading="lazy" decoding="async" /></figure> : null}
    </div>
  </Band>;
}

/** Palo Alto «spring style ✦»: thin words running across a full photo, one quiet button under them. */
function MarqueePhoto({ block, index }: { block: LibraryBlock; index: number }) {
  const words = (block.items ?? []).map(item => item.title).filter(Boolean).slice(0, 4);
  if (!block.photo || !words.length) return null;
  const run = (key: number) => <span key={key} className="lb-marquee-photo__run">{[0, 1, 2].flatMap(round => words.map((word, at) => <span key={`${round}-${at}`}>{word}<i aria-hidden="true">✦</i></span>))}</span>;
  return <Bleed block={block} index={index} className="lb-cover--dark" extra={{ 'data-lb-progress': '' }}>
    <Photo src={block.photo} className="lb-banner__photo lb-marquee-photo__img" />
    <div className="lb-marquee-photo">
      <p className="lb-marquee-photo__track" aria-label={words.join(', ')}>{[0, 1].map(run)}</p>
      {block.cta ? <a className="lb-stage__btn lb-stage__btn--small" href={href(block.link)}>{block.cta}</a> : null}
    </div>
  </Bleed>;
}

/** Palo Alto «Sustainable trends»: two photos overlapping on one side, the title and a list of points with a star on the other. */
function StoryOverlap({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.photo || !block.photo2) return null;
  const points = (block.items ?? []).filter(item => item.title).slice(0, 4);
  return <Band block={block} index={index} extra={{ 'data-lb-progress': '' }}>
    <div className="lb-overlap">
      <div className="lb-overlap__photos"><Photo src={block.photo} className="lb-overlap__a" /><Photo src={block.photo2} className="lb-overlap__b" /></div>
      <Reveal className="lb-overlap__words">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title">{block.title}</h2> : null}
        {block.text ? <p className="lb-lede">{block.text}</p> : null}
        {points.length ? <ul className="lb-overlap__points">{points.map((point, at) => <li key={at}><i aria-hidden="true">✦</i><span><strong>{point.title}</strong>{point.text ? ` ${point.text}` : ''}</span></li>)}</ul> : null}
        <Actions block={block} tone="ink" />
      </Reveal>
    </div>
  </Band>;
}

/** Palo Alto: three photos edge to edge, each with its title and a link in the middle. */
function PromoTrio({ block, index }: { block: LibraryBlock; index: number }) {
  // Palo Alto «Top summer trends»: one wide photo behind three columns of words (look single).
  if (block.look === 'single') {
    const columns = (block.items ?? []).filter(item => item.title).slice(0, 3);
    if (!block.photo || columns.length < 2) return null;
    return <Bleed block={block} index={index} className="lb-cover--dark">
      <Photo src={block.photo} className="lb-banner__photo" />
      {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden">{block.title}</h2> : null}
      <ul className="lb-trio lb-trio--single" data-count={columns.length}>{columns.map((column, at) => <li key={at}><a className="lb-trio__column" href={href(column.link)}>
        <span className="lb-trio__words">{column.text ? <span className="lb-trio__text">{column.text}</span> : null}<span className="lb-trio__title">{column.title}</span><span className="lb-trio__go">{block.cta || 'Ver más'}</span></span>
      </a></li>)}</ul>
    </Bleed>;
  }
  const tiles = (block.items ?? []).filter(item => item.photo && item.title).slice(0, 3);
  if (tiles.length < 3) return null;
  return <Bleed block={block} index={index}>
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden">{block.title}</h2> : null}
    <ul className="lb-trio">{tiles.map((tile, at) => <li key={at}><a className="lb-trio__tile" href={href(tile.link)}>
      <Photo src={tile.photo} />
      <span className="lb-trio__words"><span className="lb-trio__title">{tile.title}</span>{tile.text ? <span className="lb-trio__text">{tile.text}</span> : null}<span className="lb-trio__go">{block.cta || 'Ver más'}</span></span>
    </a></li>)}</ul>
  </Bleed>;
}


/** Palo Alto «Trending this season»: products in a row that scrolls sideways (the kit draws the store's card), with a button to all. */
function ProductsSlider({ block, index }: { block: LibraryBlock; index: number }) {
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="split" aside={<a className="es-link" href={href(block.link)}>{block.cta || 'Ver todo'} <Icons.IconArrowRight /></a>} />
    <div className="es-grid lb-slider" data-es-grid="grid4" data-pagosya-catalog data-catalog-limit={10} {...(block.products?.length ? { 'data-products': block.products.join('|') } : {})} />
  </Band>;
}

/** Palo Alto «Join our community»: the store's own posts — photos with its @name above and a link to the look below, in a row that
 *  scrolls sideways. Only for a store that links its Instagram or TikTok, with its own photos. */
function SocialPosts({ block, index }: { block: LibraryBlock; index: number }) {
  const posts = (block.items ?? []).filter(item => item.photo).slice(0, 8);
  if (!block.handle || posts.length < 3) return null;
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="center" />
    <ul className="lb-posts">{posts.map((post, at) => <li key={at} className="lb-posts__post">
      <a className="lb-posts__handle" href={block.social} target="_blank" rel="noopener">{block.handle}</a>
      <figure className="lb-posts__photo"><Photo src={post.photo} /></figure>
      {post.link ? <a className="lb-posts__look" href={href(post.link)}>{block.cta || 'Ver el look'}</a> : null}
    </li>)}</ul>
  </Band>;
}

/** Palo Alto «Made to elevate your world»: a title with one *script* word, then the store's photos running by with «síguenos» and
 *  its @name between them. Only with the store's own account. */
function SocialMarquee({ block, index }: { block: LibraryBlock; index: number }) {
  const photos = (block.items ?? []).map(item => item.photo).filter((src): src is string => Boolean(src)).slice(0, 6);
  if (!block.handle || photos.length < 3) return null;
  const title = (block.title ?? '').split('*').map((part, at) => at % 2 ? <em key={at} className="lb-script">{part}</em> : part);
  const run = (key: number) => <span key={key} className="lb-social__run">{photos.flatMap((src, at) => [<img key={`p${at}`} src={src} alt="" aria-hidden="true" loading="lazy" />, <span key={`w${at}`}>{at % 2 ? block.handle : (block.cta || 'síguenos')}</span>])}</span>;
  return <Band block={block} index={index}>
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-social__title">{title}</h2> : null}
    <a className="lb-social__track" href={block.social} target="_blank" rel="noopener" aria-label={`${block.cta || 'Síguenos'} ${block.handle}`}>{[0, 1].map(run)}</a>
  </Band>;
}

/** Palo Alto «Shop the look»: a photo with pins on the products in it; the open pin shows that product's card. Real products only. */
function ShopLook({ block, index }: { block: LibraryBlock; index: number }) {
  const pins = (block.items ?? []).filter(item => item.title && Number.isFinite(item.x) && Number.isFinite(item.y)).slice(0, 4);
  const [open, setOpen] = useState(0);
  if (!block.photo || !pins.length) return null;
  return <Bleed block={block} index={index}>
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden">{block.title}</h2> : null}
    <div className="lb-look">
      <Photo src={block.photo} className="lb-look__photo" />
      {pins.map((pin, at) => <div key={at} className="lb-look__spot" data-open={open === at ? '' : undefined} style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>
        <button type="button" className="lb-look__pin" aria-expanded={open === at} aria-label={pin.title} onClick={() => setOpen(at)}><span>{pin.title}</span></button>
        <div className="lb-look__card"><div className="lb-look__product" data-pagosya-catalog data-products={pin.title} data-catalog-limit={1} /></div>
      </div>)}
    </div>
  </Bleed>;
}

/** Palo Alto press: what each outlet said about the store, one quote at a time rising in, the outlets' names below with the current one
 *  dark. Only outlets and words the merchant gave. */
function PressQuotes({ block, index }: { block: LibraryBlock; index: number }) {
  const quotes = (block.items ?? []).filter(item => item.title && item.text).slice(0, 5);
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (quotes.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setAt(current => (current + 1) % quotes.length), 4500);
    return () => window.clearInterval(timer);
  }, [quotes.length]);
  if (!quotes.length) return null;
  return <Band block={block} index={index}>
    <div className="lb-press">
      {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
      <div className="lb-press__quotes" aria-live="polite">{quotes.map((quote, n) => <blockquote key={n} className="lb-press__quote" data-active={n === at ? '' : undefined}>«{quote.text}»</blockquote>)}</div>
      <ul className="lb-press__outlets">{quotes.map((quote, n) => <li key={n}><button type="button" data-active={n === at ? '' : undefined} onClick={() => setAt(n)}>{quote.title}</button></li>)}</ul>
    </div>
  </Band>;
}

const SECTIONS: Record<string, (props: { block: LibraryBlock; index: number }) => ReactElement | null> = {
  'cover-split': CoverSplit, 'cover-full': CoverFull, 'cover-poster': CoverPoster, 'cover-half': CoverHalf, 'cover-centered': CoverCentered, 'cover-ribbon': CoverRibbon,
  'strip-marquee': StripMarquee, 'strip-services': StripServices, 'strip-badges': StripBadges,
  'products-grid': ProductsGrid, 'products-tabs': ProductsGrid, 'products-spotlight': ProductsSpotlight, 'products-cards': ProductsCards, 'products-lookbook': ProductsLookbook, 'categories-tiles': CategoriesTiles,
  'story-split': StorySplit, 'story-checker': StoryChecker, 'story-overlay': StoryOverlay, 'story-list': StoryList, 'statement-inline': StatementInline,
  'benefits-orbit': BenefitsOrbit, 'benefits-bento': BenefitsBento, 'compare-table': CompareTable, 'steps-howto': StepsHowto, 'usecases': Usecases,
  'reviews-wall': Reviews, 'reviews-cards': Reviews,
  'promo-code': PromoCode, 'promo-pair': PromoPair, 'promo-banner': PromoBanner,
  'faq-split': FaqSplit, 'visit-store': VisitStore,
  'closing-photo': ClosingPhoto, 'closing-wordmark': ClosingWordmark,
  'bar-note': BarNote, 'cover-stage': CoverStage, 'promo-countdown': PromoCountdown, 'story-stack': StoryStack, 'statement-reveal': StatementReveal,
  'categories-list': CategoriesList, 'marquee-photo': MarqueePhoto, 'story-overlap': StoryOverlap, 'promo-trio': PromoTrio,
  'products-slider': ProductsSlider, 'social-posts': SocialPosts, 'social-marquee': SocialMarquee, 'shop-look': ShopLook, 'press-quotes': PressQuotes,
};
export const LIBRARY_SECTIONS = Object.keys(SECTIONS);

/** The home a section-library store shows: the blocks in YAPI's order, one shared card template for every product section. */
/** A template's demo layout names its photos by slot («slot:hero1»); the store's photo map holds them (34 templates 2026-10-31). */
const slotted = (src?: string) => src?.startsWith('slot:') ? (photos as Record<string, string | undefined>)[src.slice(5)] || undefined : src;
const withPhotos = (block: LibraryBlock): LibraryBlock => ({ ...block, photo: slotted(block.photo), photo2: slotted(block.photo2), ...(block.items ? { items: block.items.map(item => ({ ...item, photo: slotted(item.photo) })) } : {}) });

export function LibraryHome({ layout: given }: { layout: LibraryBlock[] }) {
  const layout = given.map(withPhotos);
  return <>
    {layout.map((block, index) => { const Section = SECTIONS[block.type]; return Section ? <Section key={index} block={block} index={index} /> : null; })}
    <LibraryScript />
  </>;
}

/** The two behaviours CSS cannot do: copy a promo code, and fit one huge word to the width (poster cover, wordmark). */
function LibraryScript() {
  useEffect(() => {
    const copy = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest?.('[data-lb-copy]');
      if (!button) return;
      navigator.clipboard?.writeText(button.getAttribute('data-lb-copy') ?? '').then(() => {
        button.setAttribute('data-copied', '');
        setTimeout(() => button.removeAttribute('data-copied'), 1600);
      }, () => undefined);
    };
    // One huge word fills its row: grown to the width (never past --lb-fit-max), then shrunk until nothing spills.
    const fit = () => document.querySelectorAll<HTMLElement>('[data-lb-fit]').forEach(el => {
      el.style.fontSize = '';
      const parent = el.parentElement;
      if (!parent) return;
      const room = getComputedStyle(parent), box = parent.clientWidth - parseFloat(room.paddingLeft) - parseFloat(room.paddingRight);
      const max = parseFloat(getComputedStyle(el).getPropertyValue('--lb-fit-max')) || 360;
      let size = parseFloat(getComputedStyle(el).fontSize);
      if (el.offsetWidth > 0 && box > 0) { size = Math.min(max, size * box / el.offsetWidth * .98); el.style.fontSize = `${size}px`; }
      for (let guard = 0; el.offsetWidth > box && size > 24 && guard < 80; guard++) { size -= 2; el.style.fontSize = `${size}px`; }
    });
    document.addEventListener('click', copy);
    window.addEventListener('resize', fit);
    fit();
    void document.fonts?.ready.then(fit);
    return () => { document.removeEventListener('click', copy); window.removeEventListener('resize', fit); };
  }, []);
  return null;
}
