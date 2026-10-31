import { useEffect, type ReactElement, type ReactNode } from 'react';
import { Reveal } from '@pagosya/ui';
import { store } from './store-data';
import * as Icons from './icons';

/* Section library (spec 2026-10-31): sections designed and tested once, the way a theme's are. YAPI only picks them, orders
 * them and fills their words and photos (store-data `layout`); it never writes their layout. Each section draws nothing it
 * has no content for, so a block the code let through with a missing part still reads as finished. */

export type LibraryItem = { title: string; text?: string; icon?: string; photo?: string; link?: string; value?: string };
export type LibraryBlock = {
  type: string; look?: string; band?: 'paper' | 'muted' | 'accent' | 'deep';
  eyebrow?: string; title?: string; text?: string; cta?: string; link?: string; cta2?: string; link2?: string;
  photo?: string; photo2?: string; items?: LibraryItem[]; products?: string[]; product?: string; code?: string;
  /** The main grid only: the store's product card (see CardTemplate). */
  card?: string;
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
function Band({ block, index, children, className = '', id }: { block: LibraryBlock; index: number; children: ReactNode; className?: string; id?: string }) {
  return <section id={id ?? `lb-${index}`} className={`es-section lb lb-${block.type} ${className}`.trim()} data-lb={block.type} data-lb-look={block.look || undefined}
    data-es-band={block.band || undefined} aria-labelledby={block.title ? `lb-${index}-title` : undefined}>{children}</section>;
}

/** Full-bleed sections (covers, photo banners): the whole width, their own colours. */
function Bleed({ block, index, children, className = '', id }: { block: LibraryBlock; index: number; children: ReactNode; className?: string; id?: string }) {
  return <section id={id ?? `lb-${index}`} className={`lb lb-bleed lb-${block.type} ${className}`.trim()} data-lb={block.type} data-lb-look={block.look || undefined}
    data-lb-band={block.band || undefined} aria-labelledby={block.title ? `lb-${index}-title` : undefined}>{children}</section>;
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
  const card = layout.find(block => block.type === 'products-grid' || block.type === 'products-tabs')?.card;
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
        <span className="lb-tiles__label"><span>{tile.title}</span><Icons.IconArrowRight /></span>
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
};
export const LIBRARY_SECTIONS = Object.keys(SECTIONS);

/** The home a section-library store shows: the blocks in YAPI's order, one shared card template for every product section. */
export function LibraryHome({ layout }: { layout: LibraryBlock[] }) {
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
