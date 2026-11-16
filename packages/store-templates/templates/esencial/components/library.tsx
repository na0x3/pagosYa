import { useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { Carousel, KineticHeadline, Reveal, ScrollScale, Tabs, VelocityRow, WordRotate } from '@pagosya/ui';
import { layout, photos, store, variants } from './store-data';
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
  /** visit-store only: what its map looks up (the address with the city). */
  map?: string;
  /** The main grid only: the store's product card (see CardTemplate). */
  card?: string;
  /** promo-countdown only: when the offer the merchant named ends (ISO date); past or missing, the section draws nothing. */
  endsAt?: string;
  /** social-* only: the store's own account (from its links) — its @name and address. */
  handle?: string; social?: string;
  /** Hand-made styles (2026-11-10): the photos of this block that are product cut-outs (transparent), drawn floating. */
  cut?: string[];
  /** Fuller hero (2026-11-13): the cover photo's own backdrop colour as the cover's ground, and whether words read dark or light on it. */
  ground?: string; groundTone?: 'light' | 'dark';
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
  return <section id={id ?? `lb-${index}`} className={`es-section lb lb-${block.type} ${className}`.trim()} data-lb-at={index} data-lb={block.type} data-lb-look={block.look || undefined}
    data-es-band={block.band || undefined} aria-labelledby={block.title ? `lb-${index}-title` : undefined} {...extra}>{children}</section>;
}

/** Full-bleed sections (covers, photo banners): the whole width, their own colours. A cover with products carries its hero shop. */
function Bleed({ block, index, children, className = '', id, extra }: { block: LibraryBlock; index: number; children: ReactNode; className?: string; id?: string; extra?: Record<string, string> }) {
  return <section id={id ?? `lb-${index}`} className={`lb lb-bleed lb-${block.type} ${className}`.trim()} data-lb-at={index} data-lb={block.type} data-lb-look={block.look || undefined}
    data-lb-band={block.band || undefined} aria-labelledby={block.title ? `lb-${index}-title` : undefined}
    {...(block.ground && /^#[0-9a-f]{6}$/i.test(block.ground) ? { 'data-ground': block.groundTone === 'dark' ? 'dark' : 'light', style: { ['--lb-ground' as string]: block.ground } as CSSProperties } : {})}
    {...extra}>{children}<HeroShop block={block} /></section>;
}

/** Hero kit (owner 2026-11-13, after Amboras's heroes): the cover sells at once — up to 3 real products the answer named, drawn by
 *  the kit with the store's card (photo, name, price, its own add button). On a photo cover one floats over the photo's corner; on the
 *  others they sit in a row under the words. Products come from the catalogue only; a name that is not a product draws nothing. */
const HERO_SHOP_COVERS = new Set(['cover-split', 'cover-full', 'cover-poster', 'cover-half', 'cover-centered', 'cover-ribbon', 'cover-stage', 'cover-video', 'cover-duo', 'cover-mega', 'hero-split']);
const HERO_SHOP_FLOAT = new Set(['cover-full', 'cover-stage', 'cover-video', 'cover-duo']);
function HeroShop({ block }: { block: LibraryBlock }) {
  const names = (block.products ?? []).slice(0, 3);
  if (!HERO_SHOP_COVERS.has(block.type) || !names.length) return null;
  return <aside className="lb-heroshop" data-place={HERO_SHOP_FLOAT.has(block.type) ? 'float' : 'row'} data-count={names.length} aria-label="Productos destacados">
    <div className="lb-heroshop__cards" data-pagosya-catalog data-products={names.join('|')} data-catalog-limit={names.length} />
  </aside>;
}

/** A title whose *word* the copy marks shows that word in the accent (two-tone titles: Shrine, Palo Alto); no marks, plain text. */
const TITLE_COLOURS: Record<string, number> = { burbuja: 4, redonda: 2, firme: 2, poster: 3 };
const UNDERLINE = new Set(['burbuja', 'redonda']);
const titleStyle = () => String((variants as Record<string, unknown>).titles ?? 'normal');
const Swoosh = () => <svg className="lb-swoosh" viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true"><path d="M3 14 C 50 4, 120 4, 197 10" /></svg>;

/** Chunky colour titles (spec 2026-11-03): the opening headline word by word in the store's title colours; the *marked* word gets the
 *  hand-drawn underline (styles with one). Normal titles are unchanged. */
export function TitleWords({ text }: { text: string }) {
  const style = titleStyle(), count = TITLE_COLOURS[style];
  if (!count) return <Marked text={text} />;
  let at = 0;
  return <>{text.split('*').map((part, segment) => part.split(/(\s+)/).map((word, n) => {
    if (!word.trim()) return word;
    const w = (at++ % count) + 1;
    return segment % 2
      ? <em key={`${segment}-${n}`} className="lb-em lb-tw" data-w={w}>{word}{UNDERLINE.has(style) ? <Swoosh /> : null}</em>
      : <span key={`${segment}-${n}`} className="lb-tw" data-w={w}>{word}</span>;
  }))}</>;
}

export function Marked({ text, swoosh = false }: { text: string; swoosh?: boolean }) {
  if (!text.includes('*')) return <>{text}</>;
  return <>{text.split('*').map((part, at) => at % 2 ? <em key={at} className="lb-em">{part}{swoosh && UNDERLINE.has(titleStyle()) ? <Swoosh /> : null}</em> : part)}</>;
}

function Head({ block, index, align = 'start', level = 2, aside }: { block: LibraryBlock; index: number; align?: 'start' | 'center' | 'split'; level?: 1 | 2; aside?: ReactNode }) {
  const Title = level === 1 ? 'h1' : 'h2';
  if (!block.title && !block.eyebrow && !block.text) return null;
  const words = <>
    {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
    {block.title ? <Title id={`lb-${index}-title`} className={level === 1 ? 'es-display lb-title' : 'es-h2 lb-title'} style={{ ['--chars' as string]: block.title.replace(/\*/g, '').length } as CSSProperties}>{level === 1 ? <TitleWords text={block.title} /> : <Marked text={block.title} swoosh={index % 2 === 0} />}</Title> : null}
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
// Template frame variety (2026-11-03): ten more cards copied from real stores (esencial globals.css, «v:lbcard» blocks).
export const LIBRARY_CARDS = ['classic', 'ribbon', 'soft', 'framed', 'arch', 'overlay', 'line', 'portrait', 'swatch', 'badge', 'polaroid', 'round-add', 'list', 'scallop', 'caps'] as const;
export type LibraryCard = typeof LIBRARY_CARDS[number];
export function libraryCard(layout: LibraryBlock[]): LibraryCard {
  // Hand-made styles (2026-11-10): their own product sections carry the card too (products-rows, products-words).
  const card = layout.find(block => ['products-grid', 'products-tabs', 'products-slider', 'products-rows', 'products-words'].includes(block.type))?.card;
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
 *  theme's CSS plays its own entrance from it — owner 2026-10-31 «se sienten lentos»: it starts just before the section reaches the
 *  screen, so nothing waits blank); a section with data-lb-progress gets --p (0→1 as it scrolls through; pinned ones
 *  through their tall box) and, with data-lb-steps, data-step; the page records the scroll direction (compact headers). Without
 *  motion everything is shown at once and --p is 1. */
export function ThemeMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sections = () => Array.from(document.querySelectorAll<HTMLElement>('main [data-lb]'));
    if (still || !('IntersectionObserver' in window)) { sections().forEach(el => el.setAttribute('data-in', '')); root.setAttribute('data-es-still', ''); return; }
    const seen = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.setAttribute('data-in', ''); seen.unobserve(entry.target); } }), { rootMargin: '0px 0px 12% 0px', threshold: 0 });
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

/** Shapes «Scratch»: a star sticker that turns slowly, its few words in the middle (a cover's eyebrow). */
function Sticker({ text, className }: { text?: string; className?: string }) {
  if (!text) return null;
  const points = Array.from({ length: 24 }, (_, at) => { const r = at % 2 ? 42 : 50, a = (Math.PI * at) / 12; return `${50 + r * Math.sin(a)},${50 - r * Math.cos(a)}`; }).join(' ');
  return <span className={`lb-seal ${className ?? ''}`} aria-hidden="true"><svg viewBox="0 0 100 100"><polygon points={points} /></svg><span>{text}</span></span>;
}

function CoverSplit({ block, index }: { block: LibraryBlock; index: number }) {
  const points = (block.items ?? []).slice(0, 3);
  const sticker = block.look === 'sticker' ? block.eyebrow : undefined;
  return <Bleed block={block} index={index} id="inicio" className="lb-cover">
    <div className="lb-cover-split__inner">
      <div className="lb-cover-split__copy">
        <Head block={{ ...block, text: undefined, eyebrow: sticker ? undefined : block.eyebrow }} index={index} level={1} />
        {block.text ? <p className="lb-cover__sub">{block.text}</p> : null}
        {points.length ? <ul className="lb-points">{points.map((point, at) => <li key={at}><Icon name={point.icon || 'check'} className="lb-points__icon" /><div><strong>{point.title}</strong>{point.text ? <span>{point.text}</span> : null}</div></li>)}</ul> : null}
        <Actions block={block} />
      </div>
      <div className="lb-cover-split__media"><Photo src={block.photo} eager /><Sticker text={sticker} /></div>
    </div>
  </Bleed>;
}

function CoverFull({ block, index }: { block: LibraryBlock; index: number }) {
  const sticker = block.look === 'sticker' ? block.eyebrow : undefined;
  return <Bleed block={block} index={index} id="inicio" className="lb-cover lb-cover--dark">
    <Photo src={block.photo} className="lb-cover-full__photo" eager />
    <Sticker text={sticker} className="lb-seal--cover" />
    <div className="lb-cover-full__copy">
      <Head block={{ ...block, text: undefined, eyebrow: sticker ? undefined : block.eyebrow }} index={index} level={1} />
      {block.text ? <p className="lb-cover__sub">{block.text}</p> : null}
      <Actions block={block} tone="light" second="ghost" />
    </div>
  </Bleed>;
}

/** Premium landing (spec 2026-11-03): nubecorp's opening with Expanse's finish — the photo on one side, the words in their own panel
 *  (never over the photo), one alignment; pills float on the photo. «Ver colores» hides when the colour cards do not draw. */
function HeroSplit({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.photo || !block.title) return null;
  const pills = (block.items ?? []).map(item => item.title).filter(Boolean).slice(0, 3);
  return <section id="inicio" className="lb lb-hero-split" data-lb-at={index} data-lb="hero-split" aria-labelledby={`lb-${index}-title`}>
    <div className="lb-hero-split__media">
      <Photo src={block.photo} className="lb-hero-split__photo" eager />
      {pills.length ? <ul className="lb-hero-split__pills" aria-label="Destacados">{pills.map((pill, at) => <li key={at} style={{ ['--i' as string]: at } as CSSProperties}><span aria-hidden="true" />{pill}</li>)}</ul> : null}
    </div>
    <div className="lb-hero-split__panel">
      {block.eyebrow ? <p className="es-eyebrow lb-hero-split__eyebrow"><span aria-hidden="true" />{block.eyebrow}</p> : null}
      <h1 id={`lb-${index}-title`} className="es-display lb-title"><TitleWords text={block.title} /></h1>
      {block.text ? <p className="lb-lede">{block.text}</p> : null}
      <div className="es-actions lb-actions">
        <a className="es-btn es-btn--accent lb-btn" href="#comprar">{block.cta || 'Ver el producto'}</a>
        {block.cta2 && (layout as LibraryBlock[]).some(entry => entry.type === 'variant-cards') ? <a className="es-btn es-btn--ghost lb-btn" href="#colores" data-needs-colour-cards="">{block.cta2}</a> : null}
      </div>
      <HeroShop block={block} />
    </div>
  </section>;
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
  return <div id={`lb-${index}`} className="lb lb-strip-marquee" data-lb-at={index} data-lb="strip-marquee" data-lb-look={block.look || 'solid'} aria-label={words.join(', ')}>
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
  if (block.look === 'banner' && block.photo) return <Band block={block} index={index}>
    <div className="lb-best">
      <div className="lb-best__photo"><Photo src={block.photo} /></div>
      {block.title ? <h2 id={`lb-${index}-title`} className="lb-best__title"><Marked text={block.title} /></h2> : null}
      <div className="lb-best__card lb-spotlight__card" data-pagosya-spotlight={block.product} data-side="right" />
    </div>
  </Band>;
  return <Band block={block} index={index}>
    <div className="lb-spotlight">
      <Reveal className="lb-spotlight__words">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}
        {block.text ? <p className="lb-lede">{block.text}</p> : null}
        {points.length ? <ul className="lb-points lb-points--plain">{points.map((point, at) => <li key={at}><Icon name={point.icon || 'check'} className="lb-points__icon" /><div><strong>{point.title}</strong>{point.text ? <span>{point.text}</span> : null}</div></li>)}</ul> : null}
      </Reveal>
      <div className="lb-spotlight__card" data-pagosya-spotlight={block.product} data-side="right" />
    </div>
  </Band>;
}

/** Owner 2026-11-02 (one-product stores: «more things about the product, the product card bigger»): the product's whole detail at the
 *  top of the home — the kit draws its gallery, options, price and «Agregar» into [data-pagosya-product-page][data-product-id]. A line of
 *  the store's words may sit above it; the product's own name is the page's heading. */
function ProductHero({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.product) return null;
  // Lively one-product stores (spec 2026-11-03): the items are short facts the kit floats over the product photo.
  const pills = (block.items ?? []).map(item => item.title).filter(Boolean).slice(0, 3);
  return <Band block={block} index={index} id="comprar">
    {block.eyebrow ? <p className="es-eyebrow lb-eyebrow lb-product-hero__note">{block.eyebrow}</p> : null}
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden">{block.title}</h2> : null}
    <div className="lb-product-hero" data-pagosya-product-page="" data-product-id={block.product} data-product-pills={pills.length ? JSON.stringify(pills) : undefined} />
  </Band>;
}

/** Premium landing (spec 2026-11-03): the colour cards; the kit draws them from the product's variants (hidden with fewer than two). */
function VariantCards({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.product) return null;
  return <Band block={block} index={index} id="colores">
    <Head block={{ ...block, title: block.title || 'Elige tu color' }} index={index} />
    <div data-pagosya-variant-cards="" data-product-id={block.product} />
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
          {block.title ? <h2 id={`lb-${index}-title`} className="lb-lookbook__title"><Marked text={block.title} /></h2> : null}
          <Button label={block.cta} link={block.link} tone="light" />
        </figcaption>
      </figure>
      <div className="lb-lookbook__products" data-pagosya-catalog data-products={names.join('|')} />
    </div>
  </Band>;
}

function CategoriesTiles({ block, index }: { block: LibraryBlock; index: number }) {
  const tiles = (block.items ?? []).filter(item => item.photo).slice(0, block.look === 'small' || block.look === 'circles' ? 8 : 4);
  if (tiles.length < 2) return null;
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="center" />
    <ul className="lb-tiles" data-count={tiles.length}>{tiles.map((tile, at) => <li key={at}><Reveal delay={at * 70}>
      <a className="lb-tiles__tile" href={href(tile.link)}>
        <Photo src={tile.photo} />
        <span className="lb-tiles__label"><span>{tile.title}{tile.text ? <small className="lb-tiles__sub">{tile.text}</small> : null}{block.look === 'button' ? <span className="lb-tiles__btn">{block.cta || 'Ver'}</span> : null}</span><Icons.IconArrowRight /></span>
      </a>
    </Reveal></li>)}</ul>
  </Band>;
}

/* ---------------------------------------------------------------- story */

function StorySplit({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.photo) return null;
  return <Band block={block} index={index}>
    <div className="lb-split" data-side={block.look === 'right' || block.look === 'circle' ? 'right' : 'left'}>
      {/* Impulse (look arch): the second photo stands beside the first in an arch, inside the photo side. */}
      <Reveal className="lb-split__media"><Photo src={block.photo} />{(block.look === 'arch' || block.look === 'wavy') && block.photo2 ? <Photo src={block.photo2} className="lb-split__inset" /> : null}</Reveal>
      <Reveal className="lb-split__copy" delay={120}>
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}
        {block.photo2 && block.look !== 'arch' && block.look !== 'wavy' ? <Photo src={block.photo2} className="lb-split__inset" /> : null}
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
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden"><Marked text={block.title} /></h2> : null}
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
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}
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
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}
        <ol className="lb-list__items">{items.map((item, at) => <li key={at}><span className="lb-list__n">{String(at + 1).padStart(2, '0')}</span><div><h3>{item.title}</h3>{item.text ? <p>{item.text}</p> : null}</div></li>)}</ol>
        <Actions block={block} />
      </Reveal>
      <Reveal className="lb-list__media" delay={120}><Photo src={block.photo} /></Reveal>
    </div>
  </Band>;
}

function StatementInline({ block, index }: { block: LibraryBlock; index: number }) {
  // Live 2026-11-10 (NOA on Joya: «vestido *hecho a tu medida*» showed its asterisks): a *marked* phrase reads in the theme's
  // emphasis, whichever photo chip falls inside it.
  const words = (block.title ?? '').split('*').flatMap((part, at) => part.split(/\s+/).filter(Boolean).map(word => ({ word, marked: at % 2 === 1 })));
  if (words.length < 4 || !block.photo) return null;
  const first = Math.max(1, Math.round(words.length / 3)), second = Math.max(first + 1, Math.round(words.length * 2 / 3));
  const chip = (src?: string) => src ? <span className="lb-statement__chip"><img src={src} alt="" aria-hidden="true" loading="lazy" /></span> : null;
  const run = (from: number, to: number) => words.slice(from, to).map((entry, at) => <span key={from + at}>{at ? ' ' : ''}{entry.marked ? <em className="lb-em">{entry.word}</em> : entry.word}</span>);
  return <Band block={{ ...block, band: block.band ?? 'muted' }} index={index}>
    <Reveal className="lb-statement">
      {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
      <h2 id={`lb-${index}-title`} className="lb-statement__text">
        {run(0, first)} {chip(block.photo)} {run(first, second)} {chip(block.photo2)} {run(second, words.length)}
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
  return <Band block={block} index={index} extra={block.look === 'stickers' ? { 'data-lb-progress': '' } : undefined}>
    {block.look === 'stickers' ? <div className="lb-stickers" aria-hidden="true">{[block.photo, block.photo2].filter(Boolean).map((src, at) => <img key={at} src={src} alt="" aria-hidden="true" className={`lb-sticker lb-sticker--${at + 1}`} loading="lazy" />)}</div> : null}
    <div className="lb-compare">
      <Reveal className="lb-compare__copy">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}
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
  if (block.look === 'panels') return <StepsPanels block={block} index={index} steps={steps} />;
  return <Band block={block} index={index}>
    <div className={block.photo && block.look !== 'cards' ? 'lb-steps lb-steps--photo' : 'lb-steps'}>
      {block.photo && block.look !== 'cards' ? <Reveal className="lb-steps__media"><Photo src={block.photo} /></Reveal> : null}
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

/** Owner 2026-11-13 (Clyro's «(01) Application»): under the product page's buy box, one step at a time in large type on a soft
 *  panel — the steps as tabs above, an arrow to the next — beside the photo, shown whole. The kit copies the product page, so the
 *  steps turn through LibraryScript's page-level clicks (data-lb-step), never React handlers. */
function StepsPanels({ block, index, steps }: { block: LibraryBlock; index: number; steps: LibraryItem[] }) {
  const number = (n: number) => String(n + 1).padStart(2, '0');
  return <Band block={block} index={index} className="lb-steps-panels">
    <div className={block.photo ? 'lb-stepp' : 'lb-stepp lb-stepp--plain'}>
      <Reveal className="lb-stepp__card">
        <div className="lb-stepp__tabs" role="tablist" aria-label={block.title || 'Pasos'} data-lb-steps>
          {steps.map((item, n) => <button key={n} type="button" role="tab" aria-selected={n === 0} data-lb-step={n}>{number(n)} · {item.title}</button>)}
        </div>
        <div className="lb-stepp__body">
          <p className="es-eyebrow lb-eyebrow">{block.eyebrow || block.title || 'Modo de uso'}</p>
          {steps.map((item, n) => <p key={n} className="lb-stepp__text" data-lb-step-text={n} hidden={n !== 0}><sup>({number(n)})</sup> {item.text || item.title}</p>)}
          <button type="button" className="lb-stepp__next" aria-label="Siguiente paso" data-lb-step-next><Icons.IconArrowRight /></button>
        </div>
      </Reveal>
      {block.photo ? <Reveal className="lb-stepp__media" delay={120}><Photo src={block.photo} /></Reveal> : null}
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
  return <section id={`lb-${index}`} className={`es-section lb lb-${block.type}`} data-lb-at={index} data-lb={block.type} data-es-band={block.band || undefined} data-pagosya-reviews-section aria-labelledby={`lb-${index}-title`}>
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
        {block.title ? <h2 id={`lb-${index}-title`} className="lb-promo__title"><Marked text={block.title} /></h2> : null}
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
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden"><Marked text={block.title} /></h2> : null}
    <ul className="lb-pair">{tiles.map((tile, at) => <li key={at}><Reveal delay={at * 100}>
      <a className="lb-pair__tile" href={href(tile.link)}>
        <Photo src={tile.photo} />
        <span className="lb-pair__words">{tile.text ? <span className="lb-pair__kicker">{tile.text}</span> : null}<span className="lb-pair__title"><Marked text={tile.title ?? ''} /></span><span className="lb-pair__go">{block.cta || 'Ver más'} <Icons.IconArrowRight /></span></span>
      </a>
    </Reveal></li>)}</ul>
  </Band>;
}

function PromoBanner({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.photo) return null;
  // Impulse (look parallax): the photo drifts with the scroll and the words rise in from below their line.
  return <Bleed block={block} index={index} className="lb-cover--dark" extra={block.look === 'parallax' ? { 'data-lb-progress': '' } : undefined}>
    {block.look === 'fade' ? <div className="lb-fade" data-count={1 + (block.items ?? []).filter(item => item.photo).slice(0, 2).length}>
      {[block.photo, ...(block.items ?? []).map(item => item.photo).filter(Boolean).slice(0, 2)].map((src, at) => <Photo key={at} src={src} className="lb-banner__photo lb-fade__photo" />)}
    </div> : <Photo src={block.photo} className="lb-banner__photo" />}
    {block.look === 'askew' && block.product ? <div className="lb-askew"><div className="lb-askew__card" data-pagosya-spotlight={block.product} data-side="right" /></div> : null}
    <Reveal className="lb-banner__copy">
      {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
      {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}
      {block.text ? <p className="lb-lede">{block.text}</p> : null}
      <Actions block={block} tone="light" />
    </Reveal>
  </Bleed>;
}

/* ---------------------------------------------------------------- info */

function FaqSplit({ block, index }: { block: LibraryBlock; index: number }) {
  const items = (block.items ?? []).slice(0, 8);
  if (items.length < 2) return null;
  // Shapes «FAQ»: the title over two columns of closed questions.
  if (block.look === 'grid') return <Band block={block} index={index} id="preguntas">
    <Head block={{ ...block, title: block.title || 'Preguntas frecuentes' }} index={index} align="center" />
    <div className="lb-faq-grid">{items.map((item, at) => <details key={at} className="lb-faq__item">
      <summary><span>{item.title}</span><Icons.IconChevronDown /></summary>
      {item.text ? <p>{item.text}</p> : null}
    </details>)}</div>
  </Band>;
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

/** Owner 2026-11-13 (Boosterpack «Visit us»): the store's photo shown whole, a «Ver mapa» button that loads the map in its place only
 *  when tapped, and a card with the address, the hours, each delivery zone with its price and time, «Cómo llegar» and WhatsApp. */
function VisitStore({ block, index }: { block: LibraryBlock; index: number }) {
  const rows = (block.items ?? []).filter(row => row.text);
  const place = rows.filter(row => row.icon !== 'truck').slice(0, 2);
  const zones = rows.filter(row => row.icon === 'truck').slice(0, 4);
  if (!place.length && !zones.length) return null;
  const directions = block.map ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(block.map)}` : '';
  const media = Boolean(block.photo || block.map);
  return <Band block={block} index={index} className="lb-visit-band">
    <div className={media ? 'lb-visit' : 'lb-visit lb-visit--plain'}>
      {media ? <Reveal className={block.photo ? 'lb-visit__media' : 'lb-visit__media lb-visit__media--map'}>
        {block.photo ? <Photo src={block.photo} /> : <span className="lb-visit__pin"><Icon name="pin" /></span>}
        {block.map ? <button type="button" className="lb-visit__maptap" data-lb-map={block.map}><Icon name="pin" />Ver mapa</button> : null}
      </Reveal> : null}
      <Reveal className="lb-visit__card" delay={120}>
        <p className="es-eyebrow lb-eyebrow">{block.eyebrow || (place.length ? 'Visítanos' : 'Envíos')}</p>
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}
        {/* The rows already say where and when: a line repeating the address goes. */}
        {block.text && !place.some(row => block.text!.includes(row.text ?? '')) ? <p className="lb-lede">{block.text}</p> : null}
        {place.length ? <dl className="lb-visit__rows">{place.map((row, at) => <div key={at}><dt><Icon name={row.icon || (at === 0 ? 'pin' : 'clock')} />{row.title}</dt><dd>{row.text}</dd></div>)}</dl> : null}
        {zones.length ? <div className="lb-visit__zones">
          {place.length ? <p className="lb-visit__label"><Icon name="truck" />Envíos</p> : null}
          <ul>{zones.map((zone, at) => <li key={at}><span>{zone.title}</span><span>{zone.text}</span></li>)}</ul>
        </div> : null}
        <div className="es-actions lb-actions lb-visit__actions">
          {directions
            ? <a className="es-btn es-btn--accent lb-btn" href={directions} target="_blank" rel="noopener">Cómo llegar<Icons.IconArrowUpRight /></a>
            : <Button label="Pedir ahora" link="products" />}
          {/* Always says what it does: a written label («Ver ubicación») would send the buyer to WhatsApp by surprise. */}
          {phone ? <Button label="Escríbenos" link="whatsapp" tone="ghost" /> : null}
        </div>
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
      {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}
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
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}
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
  return <div id={`lb-${index}`} className="lb lb-bar-note" data-lb-at={index} data-lb="bar-note"><p>{block.title}</p></div>;
}

/** Palo Alto, Impulse: the photo is the page; the words sit centre-left, one word underlined by hand, the buttons stacked full width.
 *  With item photos it becomes a slow crossfade of up to three slides (the words stay). */
function CoverStage({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.photo) return null;
  const slides = [block.photo, ...(block.items ?? []).map(item => item.photo).filter((src): src is string => Boolean(src))].slice(0, 3);
  const [first, ...rest] = (block.title ?? '').split(' ');
  return <Bleed block={block} index={index} id="inicio" className="lb-cover lb-cover--dark">
    <div className="lb-stage__slides" data-count={slides.length}>{slides.map((src, at) => <Photo key={at} src={src} className="lb-stage__photo" eager={at === 0} />)}</div>
    {slides.length > 1 ? <div className="lb-stage__bars" data-count={slides.length} aria-hidden="true">{slides.map((_, at) => <span key={at} />)}</div> : null}
    <div className={block.look === 'plain' ? 'lb-stage__copy lb-visually-hidden' : 'lb-stage__copy'}>
      {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
      {(block.title ?? '').includes('*') ? <h1 id={`lb-${index}-title`} className="lb-stage__title"><Marked text={block.title ?? ''} /></h1>
        : <h1 id={`lb-${index}-title`} className="lb-stage__title"><span className="lb-mark">{first}<svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true"><path d="M3 16c40-3 90-5 194-3" /></svg></span>{rest.length ? ` ${rest.join(' ')}` : ''}</h1>}
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
  return <Band block={{ ...block, band: block.band ?? 'muted' }} index={index} className={block.photo ? 'lb-countdown-band--photo' : ''}>
    {block.photo ? <Photo src={block.photo} className="lb-countdown__photo" /> : null}
    <div className="lb-countdown">
      <div className="lb-countdown__words">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        <h2 id={`lb-${index}-title`} className="lb-countdown__title"><Marked text={block.title} /></h2>
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
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden"><Marked text={block.title} /></h2> : null}
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
  // Better With Friends (look paragraph): one or two centred paragraphs (split by « / »), a *phrase* in italics.
  if (block.look === 'paragraph' || block.look === 'center') return <Band block={block} index={index}>
    <Reveal className="lb-paragraph">
      {block.title ? <h2 id={`lb-${index}-title`} className={block.look === 'center' ? 'es-h2 lb-title' : 'lb-visually-hidden'}><Marked text={block.title} /></h2> : null}
      {block.text.split(' / ').map((part, at) => <p key={at}><Marked text={part} /></p>)}
    </Reveal>
  </Band>;
  // Symmetry (look quote): the store's sentence in quotes, centred, still.
  if (block.look === 'quote') return <Band block={block} index={index}>
    <Reveal className="lb-quote">
      {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
      {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden"><Marked text={block.title} /></h2> : null}
      <p className="lb-quote__text">“{block.text.replace(/\*/g, '')}”</p>
    </Reveal>
  </Band>;
  const words: Array<{ word: string; marked: boolean; tail?: string }> = [];
  block.text.split('*').forEach((part, at) => {
    const parts = part.split(' ');
    // Punctuation right after a marked phrase («*moderna*.») joins its last word instead of standing alone.
    if (at % 2 === 0 && at > 0 && parts[0] && words.length) { words[words.length - 1] = { ...words[words.length - 1], tail: parts[0] }; parts.shift(); }
    parts.filter(Boolean).forEach(word => words.push({ word, marked: at % 2 === 1 }));
  });
  return <Band block={block} index={index} extra={{ 'data-lb-progress': '', 'data-lb-pinned': '' }}>
    <div className="lb-reveal__pin">
      {block.photo ? <img className="lb-reveal__sticker" src={block.photo} alt="" aria-hidden="true" loading="lazy" /> : null}
      <div className="lb-reveal" style={{ ['--n' as string]: words.length } as CSSProperties}>
        <span className="lb-reveal__dots" aria-hidden="true">•••</span>
        {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden"><Marked text={block.title} /></h2> : null}
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
  if (block.look === 'stack') return <Band block={block} index={index}>
    {block.eyebrow ? <p className="es-eyebrow lb-eyebrow lb-stackcats__eyebrow">{block.eyebrow}</p> : null}
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden">{block.title}</h2> : null}
    <ul className="lb-stackcats">{rows.map((row, at) => <li key={at}><a href={href(row.link)} aria-label={row.title}>{[...row.title].map((char, n) => <span key={n} aria-hidden="true" style={{ ['--n' as string]: n + at * 3 } as CSSProperties}>{char === ' ' ? '\u00a0' : char}</span>)}</a></li>)}</ul>
  </Band>;
  if (block.look === 'big') return <Bleed block={block} index={index} className="lb-cover--dark lb-bigcats">
    {photo ? <img key={photo} className="lb-banner__photo lb-bigcats__photo" src={photo} alt="" aria-hidden="true" loading="lazy" decoding="async" /> : null}
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden"><Marked text={block.title} /></h2> : null}
    <ul className="lb-bigcats__list">{rows.map((row, at) => <li key={at}><a href={href(row.link)} data-active={at === active ? '' : undefined} onMouseEnter={() => setActive(at)} onFocus={() => setActive(at)}>{row.title}</a></li>)}</ul>
  </Bleed>;
  return <Band block={{ ...block, band: block.band ?? 'muted' }} index={index}>
    <div className="lb-edits">
      <div className="lb-edits__words">
        {block.title ? <h2 id={`lb-${index}-title`} className="lb-edits__title"><Marked text={block.title} /></h2> : null}
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
      <div className="lb-overlap__photos"><Photo src={block.photo} className="lb-overlap__a" /><Photo src={block.photo2} className="lb-overlap__b" />
        {block.look === 'badge' && block.eyebrow ? <svg className="lb-badge-ring" viewBox="0 0 100 100" aria-hidden="true"><defs><path id={`lb-ring-${index}`} d="M50 50m-38 0a38 38 0 1 1 76 0a38 38 0 1 1-76 0" /></defs>
          <text><textPath href={`#lb-ring-${index}`}>{`${block.eyebrow} • `.repeat(4)}</textPath></text></svg> : null}</div>
      <Reveal className="lb-overlap__words">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}
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
      {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden"><Marked text={block.title} /></h2> : null}
      <ul className="lb-trio lb-trio--single" data-count={columns.length}>{columns.map((column, at) => <li key={at}><a className="lb-trio__column" href={href(column.link)}>
        <span className="lb-trio__words">{column.text ? <span className="lb-trio__text">{column.text}</span> : null}<span className="lb-trio__title">{column.title}</span><span className="lb-trio__go">{block.cta || 'Ver más'}</span></span>
      </a></li>)}</ul>
    </Bleed>;
  }
  const tiles = (block.items ?? []).filter(item => item.photo && item.title).slice(0, 3);
  if (tiles.length < 3) return null;
  return <Bleed block={block} index={index}>
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden"><Marked text={block.title} /></h2> : null}
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
    <div className="es-grid lb-slider" data-es-grid="grid4" data-pagosya-catalog data-catalog-limit={10} {...(block.products?.length ? { 'data-products': block.products.join('|') }
      // Store text check 2026-11-07: «Café para acompañar» linked to its category but showed the whole catalogue (books too).
      : block.link?.startsWith('category:') ? { 'data-category': block.link.slice(9) } : {})} />
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
  if (block.look === 'photos') {
    const reel = (key: number) => <span key={key} className="lb-reel__run">{photos.map((src, at) => <img key={at} src={src} alt="" aria-hidden="true" loading="lazy" />)}</span>;
    return <Bleed block={block} index={index}>
      {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden">{block.title}</h2> : null}
      <a className="lb-reel" href={block.social} target="_blank" rel="noopener" aria-label={`${block.cta || 'Síguenos'} ${block.handle}`}>{[0, 1].map(reel)}</a>
    </Bleed>;
  }
  const title = (block.title ?? '').split('*').map((part, at) => at % 2 ? <em key={at} className="lb-script">{part}</em> : part);
  const run = (key: number) => <span key={key} className="lb-social__run">{photos.flatMap((src, at) => [<img key={`p${at}`} src={src} alt="" aria-hidden="true" loading="lazy" />, <span key={`w${at}`}>{at % 2 ? block.handle : (block.cta || 'síguenos')}</span>])}</span>;
  return <Band block={block} index={index}>
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-social__title">{title}</h2> : null}
    <a className="lb-social__track" href={block.social} target="_blank" rel="noopener" aria-label={`${block.cta || 'Síguenos'} ${block.handle}`}>{[0, 1].map(run)}</a>
  </Band>;
}

/** Palo Alto «Shop the look»: a photo with pins on the products in it; the open pin shows that product's card. Real products only. */
/** Lively one-product stores (spec 2026-11-03, nubecorp «la textura que se siente»): a close-up photo with up to three pulsing «+»;
 *  each opens a one-line note about what is there. The notes are also a list beside the photo, so nothing hides behind a tap. */
function DetailHotspots({ block, index }: { block: LibraryBlock; index: number }) {
  const spots = (block.items ?? []).filter(item => item.title && Number.isFinite(item.x) && Number.isFinite(item.y)).slice(0, 3);
  const [open, setOpen] = useState(-1);
  useEffect(() => {
    if (open < 0) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(-1); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  if (!block.photo || !spots.length) return null;
  return <Band block={block} index={index}>
    <div className="lb-hotspots">
      <div className="lb-hotspots__frame">
        <Photo src={block.photo} className="lb-hotspots__photo" />
        {/* A note near an edge opens toward the middle, so it is never cut off (review 2026-11-03). */}
        {spots.map((spot, at) => <div key={at} className="lb-hotspots__spot" data-open={open === at ? '' : undefined} data-y={spot.y! > 60 ? 'low' : undefined}
          data-x={spot.x! < 25 ? 'left' : spot.x! > 75 ? 'right' : undefined} style={{ left: `${spot.x}%`, top: `${spot.y}%` }}>
          <button type="button" className="lb-hotspots__pin" aria-expanded={open === at} aria-label={spot.title} onClick={() => setOpen(open === at ? -1 : at)}><Icons.IconPlus /></button>
          <p className="lb-hotspots__note">{spot.title}</p>
        </div>)}
      </div>
      <div className="lb-hotspots__words">
        <Head block={block} index={index} />
        <ul className="lb-hotspots__list">{spots.map((spot, at) => <li key={at}><button type="button" aria-pressed={open === at} onClick={() => setOpen(at)}>{spot.title}</button></li>)}</ul>
      </div>
    </div>
  </Band>;
}

/** Lively one-product stores (spec 2026-11-03): short facts about the product in two rows sliding opposite ways, each chip with the
 *  product's photo (never a text-only band). The motion is the kit's marquee piece: off-screen it pauses, reduced motion stops it. */
function ChipsMarquee({ block, index }: { block: LibraryBlock; index: number }) {
  const phrases = (block.items ?? []).map(item => item.title).filter(Boolean).slice(0, 10);
  if (phrases.length < 6 || !block.photo) return null;
  // Each half of a row is wide enough to fill a laptop screen (about ten chips), so the loop never shows an empty stretch.
  const rows = [phrases.filter((_, at) => at % 2 === 0), phrases.filter((_, at) => at % 2 === 1)].map(row => Array.from({ length: Math.ceil(10 / row.length) }, () => row).flat());
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="center" />
    <ul className="lb-visually-hidden">{phrases.map((phrase, at) => <li key={at}>{phrase}</li>)}</ul>
    <div className="lb-chips" aria-hidden="true">{rows.map((row, r) => <ul key={r} className="lb-chips__row" data-pya-motion="marquee" data-dir={r ? 'right' : 'left'}>
      {[0, 1].flatMap(round => row.map((phrase, at) => <li key={`${round}-${at}`} className="lb-chips__chip"><Photo src={block.photo} className="lb-chips__thumb" /><span>{phrase}</span></li>))}
    </ul>)}</div>
  </Band>;
}

function ShopLook({ block, index }: { block: LibraryBlock; index: number }) {
  const pins = (block.items ?? []).filter(item => item.title && Number.isFinite(item.x) && Number.isFinite(item.y)).slice(0, 4);
  const points = (block.items ?? []).filter(item => item.title && !Number.isFinite(item.x)).slice(0, 4);
  const [open, setOpen] = useState(-1);
  if (!block.photo || !pins.length) return null;
  if (block.look === 'side') return <Band block={block} index={index}>
    <div className="lb-lookside">
      <div className="lb-look lb-look--framed">
        <Photo src={block.photo} className="lb-look__photo" />
        {pins.map((pin, at) => <div key={at} className="lb-look__spot lb-shop__spot" data-open={open === at ? '' : undefined} style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>
          <button type="button" className="lb-shop__pin" aria-expanded={open === at} aria-label={pin.title} onClick={() => setOpen(open === at ? -1 : at)}><Icons.IconPlus /></button>
          <div className="lb-look__card"><div className="lb-look__product" data-pagosya-catalog data-products={pin.title} data-catalog-limit={1} /></div>
        </div>)}
      </div>
      <div className="lb-lookside__words">
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}
        {points.length ? <ul className="lb-lookside__points">{points.map((point, at) => <li key={at}><Icon name={point.icon || 'sparkles'} className="lb-columns__icon" /><h3>{point.title}</h3>{point.text ? <p>{point.text}</p> : null}</li>)}</ul> : null}
      </div>
    </div>
  </Band>;
  return <Bleed block={block} index={index}>
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden"><Marked text={block.title} /></h2> : null}
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
  const quotes = (block.items ?? []).filter(item => item.title && (item.text || block.look === 'marquee' || block.look === 'row')).slice(0, 6);
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (quotes.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setAt(current => (current + 1) % quotes.length), 4500);
    return () => window.clearInterval(timer);
  }, [quotes.length]);
  if (!quotes.length) return null;
  if (block.look === 'row') return <Band block={block} index={index}>
    <Head block={block} index={index} align="center" />
    <ul className="lb-press-row">{quotes.map((quote, n) => <li key={n}>{quote.title}</li>)}</ul>
  </Band>;
  if (block.look === 'marquee') {
    const run = (key: number) => <span key={key} className="lb-press-run__run">{[0, 1, 2].flatMap(round => quotes.map((quote, n) => <span key={`${round}-${n}`}>{quote.title}</span>))}</span>;
    return <Bleed block={block} index={index}><p className="lb-press-run" aria-label={quotes.map(quote => quote.title).join(', ')}>{[0, 1].map(run)}</p></Bleed>;
  }
  if (block.look === 'logos') return <Band block={block} index={index}>
    <div className="lb-press lb-press--logos">
      {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
      <ul className="lb-press__outlets">{quotes.map((quote, n) => <li key={n}><button type="button" data-active={n === at ? '' : undefined} onClick={() => setAt(n)}>{quote.title}</button></li>)}</ul>
      <div className="lb-press__big"><span className="lb-press__mark" aria-hidden="true">”</span>
        <div className="lb-press__quotes" aria-live="polite">{quotes.map((quote, n) => <blockquote key={n} className="lb-press__quote" data-active={n === at ? '' : undefined}>{quote.text}<cite>{quote.title}</cite></blockquote>)}</div>
      </div>
      {quotes.length > 1 ? <div className="lb-press__arrows">
        <button type="button" aria-label="Anterior" onClick={() => setAt((at + quotes.length - 1) % quotes.length)}><Icons.IconChevronLeft /></button>
        <button type="button" aria-label="Siguiente" onClick={() => setAt((at + 1) % quotes.length)}><Icons.IconChevronRight /></button>
      </div> : null}
    </div>
  </Band>;
  return <Band block={block} index={index}>
    <div className="lb-press">
      {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
      <div className="lb-press__quotes" aria-live="polite">{quotes.map((quote, n) => <blockquote key={n} className="lb-press__quote" data-active={n === at ? '' : undefined}>«{quote.text}»</blockquote>)}</div>
      <ul className="lb-press__outlets">{quotes.map((quote, n) => <li key={n}><button type="button" data-active={n === at ? '' : undefined} onClick={() => setAt(n)}>{quote.title}</button></li>)}</ul>
    </div>
  </Band>;
}


/** Impulse «Easy by design»: the cover photo with a pulsing + on each product in it (the open one shows its card), the words low left. */
function CoverShoppable({ block, index }: { block: LibraryBlock; index: number }) {
  const pins = (block.items ?? []).filter(item => item.title && Number.isFinite(item.x) && Number.isFinite(item.y)).slice(0, 4);
  const [open, setOpen] = useState(-1);
  if (!block.photo) return null;
  return <Bleed block={block} index={index} id="inicio" className="lb-cover lb-cover--dark">
    <Photo src={block.photo} className="lb-cover-full__photo" eager />
    {pins.map((pin, at) => <div key={at} className="lb-look__spot lb-shop__spot" data-open={open === at ? '' : undefined} style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>
      <button type="button" className="lb-shop__pin" aria-expanded={open === at} aria-label={pin.title} onClick={() => setOpen(open === at ? -1 : at)}><Icons.IconPlus /></button>
      <div className="lb-look__card"><div className="lb-look__product" data-pagosya-catalog data-products={pin.title} data-catalog-limit={1} /></div>
    </div>)}
    <div className="lb-cover-full__copy">
      <Head block={{ ...block, text: undefined }} index={index} level={1} />
      {block.text ? <p className="lb-cover__sub">{block.text}</p> : null}
      <Actions block={block} tone="light" second="ghost" />
    </div>
  </Bleed>;
}

/** Impulse «Made to move with ease»: the store's own video playing behind a centred title. Nothing without a video. */
function CoverVideo({ block, index }: { block: LibraryBlock; index: number }) {
  const video = (photos as Record<string, string | undefined>).heroVideo;
  if (!video) return null;
  return <Bleed block={block} index={index} className="lb-cover--dark lb-video">
    <video className="lb-banner__photo" src={video} autoPlay muted loop playsInline poster={block.photo} aria-hidden="true" />
    <Reveal className="lb-banner__copy lb-banner__copy--center">
      {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
      {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}
      {block.text ? <p className="lb-lede">{block.text}</p> : null}
      <Actions block={block} tone="light" />
    </Reveal>
  </Bleed>;
}

/** Impulse image grid: four small photos over two large ones, each with its name in the middle and a link. */
function CategoriesMosaic({ block, index }: { block: LibraryBlock; index: number }) {
  const tiles = (block.items ?? []).filter(item => item.photo && item.title).slice(0, 6);
  if (tiles.length < 3) return null;
  return <Band block={block} index={index}>
    {block.title ? <Head block={block} index={index} align="center" /> : null}
    <ul className="lb-mosaic" data-count={tiles.length}>{tiles.map((tile, at) => <li key={at}><a className="lb-mosaic__tile" href={href(tile.link)}>
      <Photo src={tile.photo} /><span className="lb-mosaic__label">{tile.title}</span>
    </a></li>)}</ul>
  </Band>;
}

/** Impulse «Quietly considered»: three short columns, each a line icon, a title and a sentence. */
function IconColumns({ block, index }: { block: LibraryBlock; index: number }) {
  const columns = (block.items ?? []).filter(item => item.title).slice(0, 4);
  if (columns.length < 2) return null;
  if (block.look === 'side' && block.photo) return <Band block={block} index={index}>
    <Head block={block} index={index} align="center" />
    <div className="lb-columns-side">
      <ul className="lb-columns lb-columns--grid" data-count={columns.length}>{columns.map((column, at) => <li key={at}><Reveal delay={at * 90}>
        <Icon name={column.icon || 'sparkles'} className="lb-columns__icon" /><h3 className="lb-columns__title">{column.title}</h3>{column.text ? <p>{column.text}</p> : null}
      </Reveal></li>)}</ul>
      <Photo src={block.photo} className="lb-columns-side__photo" />
    </div>
  </Band>;
  return <Band block={block} index={index}>
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden"><Marked text={block.title} /></h2> : null}
    <ul className="lb-columns" data-count={columns.length}>{columns.map((column, at) => <li key={at}><Reveal delay={at * 90}>
      <Icon name={column.icon || 'sparkles'} className="lb-columns__icon" />
      <h3 className="lb-columns__title">{column.title}</h3>{column.text ? <p>{column.text}</p> : null}
    </Reveal></li>)}</ul>
  </Band>;
}


/** Motion «Go farther, carry less»: three photos laid over one another like prints on a table, beside the words and two buttons. */
function StoryCollage({ block, index }: { block: LibraryBlock; index: number }) {
  const prints = [block.photo, block.photo2, ...(block.items ?? []).map(item => item.photo)].filter((src): src is string => Boolean(src)).slice(0, 3);
  if (prints.length < 2) return null;
  return <Band block={block} index={index}>
    <div className="lb-collage">
      <div className="lb-collage__prints" data-count={prints.length}>{prints.map((src, at) => <Photo key={at} src={src} className="lb-collage__print" />)}</div>
      <Reveal className="lb-collage__words">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}
        {block.text ? <p className="lb-lede">{block.text}</p> : null}
        <Actions block={block} />
      </Reveal>
    </div>
  </Band>;
}

/** Motion «Join the list»: a photo beside a coloured panel with the store's newsletter form (the kit draws the field). */
function NewsletterSplit({ block, index }: { block: LibraryBlock; index: number }) {
  if (block.look === 'band') return <Band block={{ ...block, band: block.band ?? 'deep' }} index={index}>
    <div className="lb-newsband">
      <div>{block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}{block.text ? <p className="lb-lede">{block.text}</p> : null}</div>
      <div className="lb-news__form" data-pagosya-subscribe-inline data-track="newsletter" />
    </div>
  </Band>;
  if (!block.photo) return null;
  return <Bleed block={block} index={index}>
    <div className="lb-news">
      <Photo src={block.photo} className="lb-news__photo" />
      <div className="lb-news__panel">
        {block.title ? <h2 id={`lb-${index}-title`} className="lb-news__title"><Marked text={block.title} /></h2> : null}
        {block.text ? <p className="lb-news__text">{block.text}</p> : null}
        <div className="lb-news__form" data-pagosya-subscribe-inline data-track="newsletter" />
      </div>
    </div>
  </Bleed>;
}


/** Focal «PR/01 Speaker»: a row of photos with a caption under each, scrolled sideways, a thin line showing how far along it is. */
function PhotoScroller({ block, index }: { block: LibraryBlock; index: number }) {
  const shots = (block.items ?? []).filter(item => item.photo).slice(0, 8);
  const [seen, setSeen] = useState(0);
  if (shots.length < 2) return null;
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="center" />
    <ul className="lb-scroller" onScroll={event => { const el = event.currentTarget; setSeen(el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth)); }}>
      {shots.map((shot, at) => <li key={at}><figure><Photo src={shot.photo} />{shot.title || shot.text ? <figcaption>{shot.text || shot.title}</figcaption> : null}</figure></li>)}
    </ul>
    <div className="lb-scroller__line" aria-hidden="true"><span style={{ transform: `scaleX(${Math.max(0.2, seen)})` }} /></div>
  </Band>;
}

/** Focal «Around the world»: chapters of the store's story (places, years), each a photo beside its text, chosen by a row of tabs. */
function StoryTimeline({ block, index }: { block: LibraryBlock; index: number }) {
  const steps = (block.items ?? []).filter(item => item.photo && item.title).slice(0, 5);
  const [at, setAt] = useState(0);
  if (steps.length < 2) return null;
  return <Band block={{ ...block, band: block.band ?? 'deep' }} index={index}>
    <Head block={block} index={index} align="center" />
    <div className="lb-timeline">
      <div className="lb-timeline__track" style={{ transform: `translateX(calc(${-at} * (min(860px, 82vw) + 24px)))` }}>
        {steps.map((step, n) => <article key={n} className="lb-timeline__card" data-active={n === at ? '' : undefined} aria-hidden={n !== at}>
          <Photo src={step.photo} className="lb-timeline__photo" />
          <div className="lb-timeline__words"><h3>{step.title}</h3>{step.text ? <p>{step.text}</p> : null}</div>
        </article>)}
      </div>
      <ol className="lb-timeline__tabs">{steps.map((step, n) => <li key={n}><button type="button" data-active={n === at ? '' : undefined} onClick={() => setAt(n)}>{step.title}</button></li>)}</ol>
    </div>
  </Band>;
}


/** Broadcast «Made-to-order jewelry»: three photos in a row, each with its title, a line and a link under it. */
function ImageColumns({ block, index }: { block: LibraryBlock; index: number }) {
  const columns = (block.items ?? []).filter(item => item.photo && item.title).slice(0, 4);
  if (columns.length < 2) return null;
  return <Band block={block} index={index}>
    {block.title || block.eyebrow ? <Head block={block} index={index} align="center" /> : null}
    <ul className="lb-imgcols" data-count={columns.length}>{columns.map((column, at) => <li key={at}><Reveal delay={at * 150}>
      <a className="lb-imgcols__photo" href={href(column.link)}><Photo src={column.photo} /></a>
      <h3 className="lb-imgcols__title">{column.title}</h3>{column.text ? <p>{column.text}</p> : null}
      <a className="lb-imgcols__go" href={href(column.link)}>{block.cta || 'Ver más'} <Icons.IconArrowRight /></a>
    </Reveal></li>)}</ul>
  </Band>;
}

/** Broadcast «Wear every moment»: a few words running huge across a dark band, then a sentence and a button. */
function StatementMarquee({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.title) return null;
  const run = (key: number) => <span key={key} className="lb-bigrun__run">{[0, 1, 2].map(n => <span key={n}>{block.title}</span>)}</span>;
  return <Bleed block={block} index={index} className="lb-bigrun-band">
    <p className="lb-bigrun" aria-hidden="true">{[0, 1].map(run)}</p>
    <h2 id={`lb-${index}-title`} className="lb-visually-hidden"><Marked text={block.title} /></h2>
    <Reveal className="lb-bigrun__words">{block.text ? <p>{block.text}</p> : null}<Actions block={block} tone="ink" /></Reveal>
  </Bleed>;
}


/** Shrine «Incredible results»: a few percentages the merchant measured, each a ring that fills to its number, with its sentence. */
function StatsRings({ block, index }: { block: LibraryBlock; index: number }) {
  if (block.look === 'boxes') {
    const boxes = (block.items ?? []).filter(item => item.value && item.text).slice(0, 4);
    if (!boxes.length) return null;
    return <Band block={block} index={index}>
      <div className="lb-numbers">
        <div className="lb-numbers__words">{block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}{block.text ? <p className="lb-lede">{block.text}</p> : null}<Actions block={block} /></div>
        <ul className="lb-numbers__list">{boxes.map((box, at) => <li key={at}>{box.icon ? <Icon name={box.icon} className="lb-numbers__icon" /> : null}<b>{box.value}</b><span>{box.text}</span></li>)}</ul>
      </div>
    </Band>;
  }
  const stats = (block.items ?? []).map(item => ({ ...item, n: Number(String(item.value ?? '').replace(/[^\d.]/g, '')) })).filter(item => item.text && item.n > 0 && item.n <= 100).slice(0, 4);
  if (!stats.length) return null;
  return <Band block={block} index={index}>
    <div className="lb-stats">
      {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} /></h2> : null}
      <ul className="lb-stats__list">{stats.map((stat, at) => <li key={at} style={{ ['--v' as string]: stat.n } as CSSProperties}>
        <span className="lb-stats__ring"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" /><circle cx="18" cy="18" r="15.9" className="lb-stats__fill" /></svg><b>{stat.n}%</b></span>
        <p>{stat.text}</p>
      </li>)}</ul>
      {block.text ? <p className="lb-stats__note">{block.text}</p> : null}
    </div>
  </Band>;
}


/** Shrine's wave edge between bands: layered waves drifting sideways (measured: 10s and 8s, opposite ways), in the colour of the
 *  band they lead into (band), turned over (look flip) where a band ends. Decoration only: no words. */
function WaveDivider({ block, index }: { block: LibraryBlock; index: number }) {
  // fodyfoods: a band's edge made of small round scallops — «ripple» rises into the band below, «ripple-flip» hangs from the one above.
  if (block.look === 'ripple' || block.look === 'ripple-flip') return <div id={`lb-${index}`} className="lb lb-wave lb-ripple" data-lb-at={index} data-lb="wave-divider" data-lb-band={block.band || 'accent'} data-lb-look={block.look} aria-hidden="true" />;
  if (block.look === 'sway' || block.look === 'sway-flip') return <div id={`lb-${index}`} className="lb lb-wave lb-wave--sway" data-lb-at={index} data-lb="wave-divider" data-lb-band={block.band || 'accent'} data-lb-look={block.look} aria-hidden="true"><span /></div>;
  return <div id={`lb-${index}`} className="lb lb-wave" data-lb-at={index} data-lb="wave-divider" data-lb-band={block.band || 'accent'} data-lb-look={block.look || undefined} aria-hidden="true">
    <svg viewBox="0 24 150 28" preserveAspectRatio="none">
      <defs><path id={`lb-wave-${index}`} d="M-160 44c30 0 58-18 88-18s58 18 88 18 58-18 88-18 58 18 88 18v44h-352z" /></defs>
      <g className="lb-wave__layers">
        <use href={`#lb-wave-${index}`} x="48" y="0" className="lb-wave__a" />
        <use href={`#lb-wave-${index}`} x="48" y="3" className="lb-wave__b" />
        <use href={`#lb-wave-${index}`} x="48" y="5" className="lb-wave__c" />
      </g>
    </svg>
  </div>;
}


/** Gumdrop «Grains that play hard»: short qualities in coloured tiles, zig-zagging with the store's photos, two per row. */
function CheckerRows({ block, index }: { block: LibraryBlock; index: number }) {
  const rows = (block.items ?? []).filter(item => item.title && item.photo).slice(0, 4);
  if (rows.length < 2) return null;
  return <Band block={block} index={index}>
    <Head block={block} index={index} />
    <ul className="lb-zig">{rows.map((row, at) => <li key={at} data-flip={at % 2 ? '' : undefined}>
      <Reveal className="lb-zig__tile" delay={0}><h3>{row.title}</h3>{row.text ? <p>{row.text}</p> : null}</Reveal>
      <Reveal className="lb-zig__photo" delay={75}><Photo src={row.photo} /></Reveal>
    </li>)}</ul>
  </Band>;
}

/* ------------------------------------------- new sections from real stores (spec 2026-11-04-new-sections-from-real-stores) */

/** Kotn's opening: two photos to the edges, the headline across both, a white button at the foot of each. */
function CoverDuo({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.photo || !block.photo2) return null;
  const halves = [{ src: block.photo, label: block.cta, link: block.link }, { src: block.photo2, label: block.cta2, link: block.link2 }];
  return <Bleed block={block} index={index} id="inicio" className="lb-cover lb-cover--dark">
    <div className="lb-duo">
      {halves.map((half, at) => <figure key={at} className="lb-duo__half">
        <Photo src={half.src} eager />
        {half.label ? <Button label={half.label} link={half.link} tone="light" /> : null}
      </figure>)}
      <div className="lb-duo__words">
        <Head block={{ ...block, text: undefined }} index={index} level={1} align="center" />
        {block.text ? <p className="lb-cover__sub">{block.text}</p> : null}
      </div>
    </div>
  </Bleed>;
}

/** Olipop «Shop by fiber line»: two big rounded photo cards, a round sticker on each photo, a title, a line and a button. */
function PromoLines({ block, index }: { block: LibraryBlock; index: number }) {
  const lines = (block.items ?? []).filter(item => item.photo).slice(0, 2);
  if (lines.length < 2) return null;
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="center" />
    <ul className="lb-lines">{lines.map((line, at) => <li key={at}><Reveal delay={at * 100}>
      <a className="lb-lines__photo" href={href(line.link)} aria-label={line.title}>
        <Photo src={line.photo} />
        {line.value ? <span className="lb-lines__sticker" data-n={at} style={{ ['--len' as string]: Math.max(...line.value.split(/\s+/).map(word => word.length)) } as CSSProperties}><span>{line.value}</span></span> : null}
      </a>
      <h3 className="lb-lines__title">{line.title}</h3>
      {line.text ? <p className="lb-lines__text">{line.text}</p> : null}
      <Button label={block.cta || 'Ver más'} link={line.link} />
    </Reveal></li>)}</ul>
  </Band>;
}

/** Olipop «Made with real ingredients»: words on a soft band, the photo in a circle ringed by slowly turning rays (look rings: thin
 *  rings, for calm stores). */
function StorySunburst({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.photo) return null;
  return <Band block={{ ...block, band: block.band ?? 'muted' }} index={index}>
    <div className="lb-sun" data-side={block.look === 'left' ? 'left' : 'right'}>
      <Reveal className="lb-sun__copy">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title"><Marked text={block.title} swoosh /></h2> : null}
        {block.text ? <p className="lb-body">{block.text}</p> : null}
        <Actions block={block} />
      </Reveal>
      <Reveal className="lb-sun__media" delay={120}>
        <span className="lb-sun__rays" aria-hidden="true" />
        <span className="lb-sun__disc"><Photo src={block.photo} /></span>
      </Reveal>
    </div>
  </Band>;
}

/** Summer Fridays «Beauty you look forward to»: a photo framed on a striped panel; beside it the store's perks as rows with a pill. */
function PerksRows({ block, index }: { block: LibraryBlock; index: number }) {
  const perks = (block.items ?? []).slice(0, 4);
  if (!block.photo || perks.length < 2) return null;
  return <Band block={block} index={index}>
    <div className="lb-perks">
      <Reveal className="lb-perks__media"><span className="lb-perks__frame"><Photo src={block.photo} /></span></Reveal>
      <div className="lb-perks__copy">
        <Head block={block} index={index} />
        <ul className="lb-perks__list">{perks.map((perk, at) => <li key={at}><Reveal delay={at * 80}>
          <a className="lb-perks__row" href={href(perk.link)}>
            <span className="lb-perks__name"><strong>{perk.title}</strong>{perk.text ? <small>{perk.text}</small> : null}</span>
            {perk.value ? <span className="lb-perks__pill">{perk.value}</span> : null}
            <Icons.IconArrowRight />
          </a>
        </Reveal></li>)}</ul>
      </div>
    </div>
  </Band>;
}

/** Before and after: both photos in one frame, the before clipped at a line the shopper drags (a range input, so keys work too). */
function BeforeAfter({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.photo || !block.photo2) return null;
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="center" />
    <Reveal className="lb-ba">
      <div className="lb-ba__frame" style={{ ['--lb-cut' as string]: '50%' } as CSSProperties}>
        <Photo src={block.photo2} className="lb-ba__after" />
        <Photo src={block.photo} className="lb-ba__before" />
        <span className="lb-ba__label lb-ba__label--before">Antes</span>
        <span className="lb-ba__label lb-ba__label--after">Después</span>
        <span className="lb-ba__line" aria-hidden="true"><span className="lb-ba__knob"><Icons.IconChevronLeft /><Icons.IconChevronRight /></span></span>
        <input className="lb-ba__range" type="range" min={0} max={100} defaultValue={50} aria-label="Comparar antes y después" data-lb-compare />
      </div>
    </Reveal>
    {block.cta ? <p className="lb-more"><Button label={block.cta} link={block.link} /></p> : null}
  </Band>;
}

/* lb:product-personalizer */
/** Spec 2026-11-09 personalizador (the Oct-27 «Marco» look the owner liked): the kit draws the product's own choices on a big stage
 *  into the host — circles for colours, pills for sizes and flavours, its price and «Añadir al carrito». The frame look only in art
 *  stores. A product without options hides the section. */
function ProductPersonalizer({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.product) return null;
  return <Band block={block} index={index} id="personaliza">
    {block.title || block.eyebrow ? <Head block={block} index={index} /> : null}
    <div data-pagosya-personalizer="" data-product-id={block.product} data-look={block.look === 'frame' ? 'frame' : 'stage'} />
  </Band>;
}
/* /lb:product-personalizer */

/* ---------------------------------------------------------------- Merienda (spec 2026-11-10, after bakeme.pages.dev) */

/** Huge chunky capitals on the brand's colour, the product photo in the store's photo treatment with a round sticker of 1–3 words
 *  (eyebrow), and the curved ribbon of words (items). Looks: side (photo right), stack (photo under the title), tilt (photo left). */
function CoverMega({ block, index }: { block: LibraryBlock; index: number }) {
  const words = (block.items ?? []).map(item => item.title).filter(Boolean);
  const ribbon = `${(words.length ? words : [store.name]).join('  ✦  ')}  ✦  `.repeat(6);
  const look = block.look === 'stack' || block.look === 'tilt' ? block.look : 'side';
  return <Bleed block={{ ...block, look }} index={index} id="inicio" className="lb-cover">
    <div className="lb-mega__inner">
      <div className="lb-mega__copy">
        <Head block={{ ...block, eyebrow: undefined, text: undefined }} index={index} level={1} />
        {block.text ? <p className="lb-cover__sub">{block.text}</p> : null}
        <Actions block={block} tone="ink" />
      </div>
      {block.photo ? <div className="lb-mega__media"><Photo src={block.photo} className={block.cut?.includes(block.photo) ? 'lb-fx lb-cut' : 'lb-fx'} eager />{block.eyebrow ? <span className="lb-mega__sticker">{block.eyebrow}</span> : null}</div> : null}
    </div>
    <svg className="lb-ribbon" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true">
      <path id={`lb-${index}-curve`} d="M-40,150 C320,40 560,40 760,110 S1180,190 1480,60" fill="none" />
      <path className="lb-ribbon__band" d="M-40,150 C320,40 560,40 760,110 S1180,190 1480,60" />
      <text className="lb-ribbon__text"><textPath href={`#lb-${index}-curve`} startOffset="0">{ribbon}<animate attributeName="startOffset" from="0%" to="-50%" dur="40s" repeatCount="indefinite" /></textPath></text>
    </svg>
  </Bleed>;
}

/** Each product on its own tint (Bake Me's flavours): its name huge, one line from the store (items[i].text), and the store's own
 *  product card — photo, price and «Agregar» — drawn by the kit. Looks: alternate (sides switch), cards (two per row), stack. */
function ProductsRows({ block, index }: { block: LibraryBlock; index: number }) {
  const names = (block.products ?? []).slice(0, 5);
  if (names.length < 2) return null;
  const look = block.look === 'cards' || block.look === 'stack' ? block.look : 'alternate';
  const lineOf = (name: string) => block.items?.find(item => item.title === name)?.text;
  // The product's colour, read from its photo at build (a #hex in the item's value); without one the theme's tints stay.
  const tintOf = (name: string) => { const value = block.items?.find(item => item.title === name)?.value; return value && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined; };
  return <Band block={{ ...block, look }} index={index} id="sabores">
    <Head block={block} index={index} align="center" />
    <ul className="lb-rows" data-count={names.length}>{names.map((name, at) => <li key={name} className="lb-rows__row" data-tint={at % 4}
      style={tintOf(name) ? { ['--mer-photo' as string]: tintOf(name) } as CSSProperties : undefined}>
      <Reveal className="lb-rows__words">
        <h3 className="lb-rows__name">{name}</h3>
        {lineOf(name) ? <p className="lb-rows__line">{lineOf(name)}</p> : null}
      </Reveal>
      <div className="es-grid lb-rows__card" data-es-grid="grid1" data-pagosya-catalog data-products={name} />
    </li>)}</ul>
  </Band>;
}

/** The products' names huge, one per line, lit one at a time as the page scrolls past (all lit without motion), each a link with its
 *  photo beside the lit name. Looks: light (grey → ink), outline (outlined → filled). */
function NamesList({ block, index }: { block: LibraryBlock; index: number }) {
  const items = (block.items ?? []).filter(item => item.title).slice(0, 6);
  if (items.length < 3) return null;
  const look = block.look === 'outline' ? 'outline' : 'light';
  // Long product names («Comida fresca pollo y manzana 500 g», Pawby) shrink the whole list so each still fits on a line or two.
  const longest = Math.max(...items.map(item => item.title.length));
  return <Band block={{ ...block, look }} index={index} extra={{ 'data-lb-progress': '', 'data-lb-steps': String(items.length) }}>
    {block.eyebrow ? <p className="es-eyebrow lb-eyebrow lb-names__eyebrow">{block.eyebrow}</p> : null}
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden"><Marked text={block.title} /></h2> : null}
    <ol className="lb-names" style={{ ['--names-len' as string]: Math.max(10, longest) } as CSSProperties}>{items.map((item, at) => <li key={at} data-i={at}>
      <a className="lb-names__link" href={href(item.link)}><span className="lb-names__word">{item.title}</span>{item.photo ? <img className={`lb-names__photo lb-fx${block.cut?.includes(item.photo) ? ' lb-cut' : ''}`} src={item.photo} alt="" aria-hidden="true" loading="lazy" decoding="async" /> : null}</a>
    </li>)}</ol>
  </Band>;
}

/** A big sentence about the product with two of its photos as stickers. Looks: left (words left, stickers right), center. */
function StatementSticker({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.title || !block.photo) return null;
  const look = block.look === 'center' ? 'center' : 'left';
  return <Band block={{ ...block, look }} index={index}>
    <div className="lb-stsk">
      <Reveal className="lb-stsk__words">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        <h2 id={`lb-${index}-title`} className="lb-stsk__title"><Marked text={block.title} /></h2>
        {block.text ? <p className="lb-lede">{block.text}</p> : null}
        <Actions block={block} />
      </Reveal>
      <div className="lb-stsk__media">
        <Photo src={block.photo} className={`lb-fx lb-stsk__one${block.cut?.includes(block.photo) ? ' lb-cut' : ''}`} />
        {block.photo2 ? <Photo src={block.photo2} className={`lb-fx lb-stsk__two${block.cut?.includes(block.photo2) ? ' lb-cut' : ''}`} /> : null}
      </div>
    </div>
  </Band>;
}

/* ---------------------------------------------------------------- hand-made styles, round 2 (spec 2026-11-10, real stores) */

/** Burbuja, after rhode («prep / the kit / blush»): a sideways row of tall product cards, each under one giant lowercase word that
 *  says what the product is for (items: title = the product's exact name, value = the word). Looks: grey (cards on grey), white. */
function ProductsWords({ block, index }: { block: LibraryBlock; index: number }) {
  const items = (block.items ?? []).filter(item => item.title).slice(0, 8);
  if (items.length < 3) return null;
  const look = block.look === 'white' ? 'white' : 'grey';
  return <Band block={{ ...block, look }} index={index} id="productos">
    <Head block={block} index={index} align="split" aside={<a className="es-link" href="productos.html">{block.cta || 'Ver todo'} <Icons.IconArrowRight /></a>} />
    <ul className="lb-words">{items.map((item, at) => <li key={at} className="lb-words__card">
      <p className="lb-words__word" aria-hidden="true">{(item.value || item.title).toLowerCase()}</p>
      <div className="es-grid lb-words__product" data-es-grid="grid1" data-pagosya-catalog data-products={item.title} />
    </li>)}</ul>
  </Band>;
}

/** Burbuja, after rhode («to restore, protect and nurture…»): one statement with a button and 2–4 values that open on a tap, beside
 *  a black-and-white portrait. Looks: left (words left), right. */
function ValuesPortrait({ block, index }: { block: LibraryBlock; index: number }) {
  const items = (block.items ?? []).filter(item => item.title).slice(0, 4);
  if (!block.title || !block.photo || items.length < 2) return null;
  const look = block.look === 'right' ? 'right' : 'left';
  return <Band block={{ ...block, look }} index={index}>
    <div className="lb-values">
      <div className="lb-values__words">
        <Reveal>
          <h2 id={`lb-${index}-title`} className="lb-values__title"><Marked text={block.title} /></h2>
          {block.cta ? <p className="lb-values__cta"><Button label={block.cta} link={block.link} tone="ghost" /></p> : null}
        </Reveal>
        <ul className="lb-values__list">{items.map((item, at) => <li key={at}><details>
          <summary>{item.title}<Icons.IconArrowRight /></summary>{item.text ? <p>{item.text}</p> : null}
        </details></li>)}</ul>
      </div>
      <div className="lb-values__photo"><Photo src={block.photo} /></div>
    </div>
  </Band>;
}

/** Neón, after Kith: a campaign — a full-bleed photo with its title bottom-left and two buttons bottom-right — then four products of
 *  that collection (link = category:Name; without one, or with a category an earlier campaign shows, the photo alone). Looks: tall, wide. */
function CampaignStrip({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.photo) return null;
  const category = block.link?.startsWith('category:') ? block.link.slice(9) : undefined;
  const look = block.look === 'wide' ? 'wide' : 'tall';
  return <Bleed block={{ ...block, look }} index={index}>
    <div className="lb-campaign__photo">
      <Photo src={block.photo} />
      <div className="lb-campaign__bar">
        <div className="lb-campaign__words">
          {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
          {block.title ? <h2 id={`lb-${index}-title`} className="lb-campaign__title"><Marked text={block.title} /></h2> : null}
          {block.text ? <p className="lb-campaign__text">{block.text}</p> : null}
        </div>
        <Actions block={block} tone="light" second="light" />
      </div>
    </div>
    {category ? <div className="es-grid lb-campaign__products" data-es-grid="grid4" data-pagosya-catalog data-catalog-limit={4} data-category={category} /> : null}
  </Bleed>;
}

/** Mimo, after Wild One («Experience Wild One IRL»): a colour panel (a light mix of the brand colour) with a centred title, a line and
 *  a button, beside a photo that fills its half. Looks: left (panel left), right. */
function BlockSplit({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.title || !block.photo) return null;
  const look = block.look === 'right' ? 'right' : 'left';
  return <Bleed block={{ ...block, look }} index={index} extra={{ 'data-tint': String(index % 3) }}>
    <div className="lb-block">
      <div className="lb-block__panel"><Reveal className="lb-block__words">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        <h2 id={`lb-${index}-title`} className="lb-block__title"><Marked text={block.title} /></h2>
        {block.text ? <p className="lb-lede">{block.text}</p> : null}
        <Actions block={block} />
      </Reveal></div>
      <div className="lb-block__photo"><Photo src={block.photo} /></div>
    </div>
  </Bleed>;
}

/** Mimo, after Wild One («A DOG A DAY»): a short word (eyebrow: the store's name or one word, up to 8 letters) in colourful letter
 *  tiles with the store's photo in the second tile, beside a title, a line and a button. Looks: left (tiles left), right. */
function LettersSplit({ block, index }: { block: LibraryBlock; index: number }) {
  const word = (block.eyebrow || String(store.name ?? '')).normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 8).toUpperCase();
  if (!block.title || !block.photo || word.length < 2) return null;
  const look = block.look === 'right' ? 'right' : 'left';
  const letters = word.split('');
  return <Band block={{ ...block, look }} index={index}>
    <div className="lb-letters">
      <div className="lb-letters__grid" aria-label={word} data-count={letters.length + 1}>
        <span className="lb-letters__tile" data-shape="0" data-tint="0" aria-hidden="true">{letters[0]}</span>
        <span className="lb-letters__tile lb-letters__tile--photo" aria-hidden="true"><Photo src={block.photo} /></span>
        {letters.slice(1).map((letter, at) => <span key={at} className="lb-letters__tile" data-shape={(at + 1) % 4} data-tint={(at + 1) % 3} aria-hidden="true">{letter}</span>)}
      </div>
      <Reveal className="lb-letters__words">
        <h2 id={`lb-${index}-title`} className="lb-letters__title"><Marked text={block.title} /></h2>
        {block.text ? <p className="lb-lede">{block.text}</p> : null}
        <Actions block={block} />
      </Reveal>
    </div>
  </Band>;
}

/** Oliva, after Graza («Olive oil so fresh, / you can taste it»): a big serif sentence in two lines (title split by « / »), the first
 *  to the left and the second to the right, a small round photo between them and one quiet line under. */
function StatementOffset({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.title || !block.photo) return null;
  const [first, ...rest] = block.title.split(' / ');
  return <Band block={block} index={index}>
    <Reveal className="lb-offset">
      <h2 id={`lb-${index}-title`} className="lb-offset__title"><span className="lb-offset__one"><Marked text={first} /></span>
        <img className={`lb-offset__photo lb-fx${block.cut?.includes(block.photo) ? ' lb-cut' : ''}`} src={block.photo} alt="" aria-hidden="true" loading="lazy" decoding="async" />
        {rest.length ? <span className="lb-offset__two"><Marked text={rest.join(' ')} /></span> : null}</h2>
      {block.text ? <p className="lb-offset__text">{block.text}</p> : null}
      {block.cta ? <Button label={block.cta} link={block.link} tone="ghost" /> : null}
    </Reveal>
  </Band>;
}

/** Oliva, after Graza («GRAZA — Olive oil the way it should be»): the store's name huge, one line, then its products, each under a
 *  nickname in quotes (items: title = the product's exact name, value = the nickname), and a full-width button to everything. */
function ProductsNicknames({ block, index }: { block: LibraryBlock; index: number }) {
  const items = (block.items ?? []).filter(item => item.title).slice(0, 4);
  if (items.length < 2) return null;
  return <Band block={block} index={index} id="productos">
    <div className="lb-nick__head">
      <p className="lb-nick__name" aria-hidden="true">{store.name}</p>
      {block.title ? <h2 id={`lb-${index}-title`} className="lb-nick__title"><Marked text={block.title} /></h2> : null}
    </div>
    <ul className="lb-nick" data-count={items.length}>{items.map((item, at) => <li key={at}>
      {item.value ? <p className="lb-nick__nick">“{item.value}”</p> : null}
      <div className="es-grid lb-nick__card" data-es-grid="grid1" data-pagosya-catalog data-products={item.title} />
    </li>)}</ul>
    <p className="lb-nick__all"><a className="es-btn es-btn--accent lb-btn" href="productos.html">{block.cta || 'Ver todo'}<Icons.IconArrowRight /></a></p>
  </Band>;
}

/** Oliva, after Graza («So many ways to Graza»): a band in the brand's colour with the store's words running along its top, the ways
 *  to use the product scattered big at different sizes (items: 3 to 8 verbs), a photo beside them and one button. */
function VerbsPhoto({ block, index }: { block: LibraryBlock; index: number }) {
  const verbs = (block.items ?? []).map(item => item.title).filter(Boolean).slice(0, 8);
  if (verbs.length < 3 || !block.photo) return null;
  const line = `${(block.title || store.name).replace(/\*/g, '')}  ·  `.repeat(8);
  return <Bleed block={block} index={index}>
    <p className="lb-verbs__run" aria-hidden="true"><span>{line}</span><span>{line}</span></p>
    <div className="lb-verbs">
      <div className="lb-verbs__words">
        {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden"><Marked text={block.title} /></h2> : null}
        <ul className="lb-verbs__list">{verbs.map((verb, at) => <li key={at} data-v={at % 4}>{verb}</li>)}</ul>
        <Actions block={block} />
      </div>
      <div className="lb-verbs__photo"><Photo src={block.photo} />{block.text ? <p className="lb-verbs__note">{block.text}</p> : null}</div>
    </div>
  </Bleed>;
}

/** Origen, after Onyx Coffee Lab (Peru · Ecuador · Colombia): 2 to 4 photos with an arched top, each place or line's name over its
 *  photo, a short line under and a link (items with photo; link = category:Name or products). */
function OriginsArches({ block, index }: { block: LibraryBlock; index: number }) {
  const items = (block.items ?? []).filter(item => item.photo && item.title).slice(0, 4);
  if (items.length < 2) return null;
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="center" />
    <ul className="lb-arches" data-count={items.length}>{items.map((item, at) => <li key={at}><Reveal delay={at * 90}>
      <a className="lb-arches__card" href={href(item.link)}>
        <span className="lb-arches__photo"><Photo src={item.photo} /><span className="lb-arches__name">{item.title}</span></span>
        {item.text ? <span className="lb-arches__text">{item.text}</span> : null}
        <span className="lb-arches__more">{block.cta || 'Ver más'} <Icons.IconArrowRight /></span>
      </a>
    </Reveal></li>)}</ul>
  </Band>;
}

/* Rich sections (owner 2026-11-13 «do your suggestion»): the kit's rich pieces as library sections, filled with words and photos
 * like every other. The motion is the kit's (still when the visitor turns motion off); the layout and type are the template's.
 * Owner 2026-11-13 «dont let yapi crop pictures»: every photo here shows whole, in its own shape (.lb-whole), never past its size. */

/** A cover whose headline comes in word by word, the photo below growing as the visitor scrolls (centred, never the full width). */
function CoverKinetic({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.title) return null;
  return <Bleed block={block} index={index} id="inicio" className="lb-cover">
    <div className="lb-kinetic__copy">
      {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
      <KineticHeadline as="h1" text={block.title.replace(/\*/g, '')} className="es-display lb-title lb-kinetic__title" />
      {block.text ? <p className="lb-cover__sub">{block.text}</p> : null}
      <Actions block={block} />
    </div>
    {block.photo ? <ScrollScale className="lb-kinetic__media" from={0.84}><Photo src={block.photo} className="lb-whole" eager /></ScrollScale> : null}
  </Bleed>;
}

/** A big line whose last words change by themselves («Burbujas para» la tarde / compartir / regalar), beside a framed photo. */
function StatementRotate({ block, index }: { block: LibraryBlock; index: number }) {
  const words = (block.items ?? []).map(item => item.title).filter(Boolean).slice(0, 5);
  if (!block.title || words.length < 2 || !block.photo) return null;
  return <Band block={block} index={index}>
    <div className="lb-rotate" data-lb-side={block.look === 'left' ? 'left' : 'right'}>
      <Reveal className="lb-rotate__copy">
        {block.eyebrow ? <p className="es-eyebrow lb-eyebrow">{block.eyebrow}</p> : null}
        <h2 id={`lb-${index}-title`} className="es-h2 lb-title lb-rotate__title">{block.title.replace(/\*/g, '')} <WordRotate words={words} className="lb-rotate__word" /></h2>
        {block.text ? <p className="lb-lede">{block.text}</p> : null}
        <Actions block={block} />
      </Reveal>
      <figure className="lb-rotate__media"><Photo src={block.photo} className="lb-whole" /></figure>
    </div>
  </Band>;
}

/** A slideshow of 2 to 5 of the store's moments, one photo at a time, each with its line and link. */
function StoryCarousel({ block, index }: { block: LibraryBlock; index: number }) {
  const slides = (block.items ?? []).filter(item => item.photo && item.title).slice(0, 5);
  if (slides.length < 2) return null;
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="split" />
    <Carousel className="lb-carousel" aspect="16/8" label={block.title?.replace(/\*/g, '') || store.name}
      slides={slides.map(item => ({ image: { src: item.photo!, alt: '' }, title: item.title, text: item.text, ...(item.link ? { href: href(item.link), cta: block.cta || 'Ver más' } : {}) }))} />
  </Band>;
}

/** 2 to 4 tabs (a use, a moment, a line of products), each with its photo and a few words. */
function TabsPhoto({ block, index }: { block: LibraryBlock; index: number }) {
  const tabs = (block.items ?? []).filter(item => item.title && item.text && (item.photo || block.photo)).slice(0, 4);
  if (tabs.length < 2) return null;
  return <Band block={block} index={index}>
    <Head block={block} index={index} />
    <Tabs className="lb-tabs" label={block.title?.replace(/\*/g, '') || 'Opciones'} tabs={tabs.map(item => ({ label: item.title, content: <div className="lb-tabs__panel">
      <figure className="lb-tabs__photo"><Photo src={item.photo || block.photo} className="lb-whole" /></figure>
      <div className="lb-tabs__copy"><p className="lb-tabs__lead">{item.text}</p>{item.link ? <a className="es-link" href={href(item.link)}>{block.cta || 'Ver más'} <Icons.IconArrowRight /></a> : null}</div>
    </div> }))} />
  </Band>;
}

/** The brand's words in large type, a strip that speeds up and turns with the visitor's scroll. */
function StripVelocity({ block, index }: { block: LibraryBlock; index: number }) {
  const words = (block.items ?? []).map(item => item.title).filter(Boolean).slice(0, 6);
  if (words.length < 2) return null;
  return <div id={`lb-${index}`} className="lb lb-strip-velocity" data-lb-at={index} data-lb="strip-velocity" data-lb-band={block.band || undefined} aria-label={words.join(', ')}>
    <VelocityRow speed={3} gap={40}><p className="lb-velocity__line" aria-hidden="true">{words.map((word, at) => <span key={at}>{word}<i aria-hidden="true">✦</i></span>)}</p></VelocityRow>
  </div>;
}

/** Owner 2026-11-13 («discounts everything like full kits»): the store's real packs, drawn by the kit from its bundles — photos, what is
 *  inside, the saving and one button for the whole pack. The platform adds it only when the store has an active pack. */
/** Owner 2026-11-13 (ways to pay): how the store takes payment, drawn by the kit from its checkout mode — never a method it lacks. */
function PayWays({ block, index }: { block: LibraryBlock; index: number }) {
  return <Band block={{ ...block, band: block.band ?? 'muted' }} index={index}>
    <div className="lb-payways">
      {block.title ? <h2 id={`lb-${index}-title`} className="es-h2 lb-title lb-payways__title">{block.title}</h2> : null}
      <div data-pagosya-payways />
    </div>
  </Band>;
}

function PacksKits({ block, index }: { block: LibraryBlock; index: number }) {
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="split" />
    <div className="lb-packs" data-pagosya-bundles />
  </Band>;
}

const SECTIONS: Record<string, (props: { block: LibraryBlock; index: number }) => ReactElement | null> = {
  'cover-split': CoverSplit, 'hero-split': HeroSplit, 'variant-cards': VariantCards, 'cover-full': CoverFull, 'cover-poster': CoverPoster, 'cover-half': CoverHalf, 'cover-centered': CoverCentered, 'cover-ribbon': CoverRibbon,
  'strip-marquee': StripMarquee, 'strip-services': StripServices, 'strip-badges': StripBadges,
  'detail-hotspots': DetailHotspots, 'chips-marquee': ChipsMarquee,
  'products-grid': ProductsGrid, 'products-tabs': ProductsGrid, 'products-spotlight': ProductsSpotlight, 'product-personalizer': ProductPersonalizer, 'product-hero': ProductHero, 'products-cards': ProductsCards, 'products-lookbook': ProductsLookbook, 'categories-tiles': CategoriesTiles,
  'story-split': StorySplit, 'story-checker': StoryChecker, 'story-overlay': StoryOverlay, 'story-list': StoryList, 'statement-inline': StatementInline,
  'benefits-orbit': BenefitsOrbit, 'benefits-bento': BenefitsBento, 'compare-table': CompareTable, 'steps-howto': StepsHowto, 'usecases': Usecases,
  'reviews-wall': Reviews, 'reviews-cards': Reviews,
  'promo-code': PromoCode, 'promo-pair': PromoPair, 'promo-banner': PromoBanner,
  'faq-split': FaqSplit, 'visit-store': VisitStore,
  'closing-photo': ClosingPhoto, 'closing-wordmark': ClosingWordmark,
  'bar-note': BarNote, 'cover-stage': CoverStage, 'promo-countdown': PromoCountdown, 'story-stack': StoryStack, 'statement-reveal': StatementReveal,
  'categories-list': CategoriesList, 'marquee-photo': MarqueePhoto, 'story-overlap': StoryOverlap, 'promo-trio': PromoTrio,
  'checker-rows': CheckerRows, 'stats-rings': StatsRings, 'wave-divider': WaveDivider,
  'image-columns': ImageColumns, 'statement-marquee': StatementMarquee,
  'photo-scroller': PhotoScroller, 'story-timeline': StoryTimeline,
  'story-collage': StoryCollage, 'newsletter-split': NewsletterSplit,
  'cover-shoppable': CoverShoppable, 'cover-video': CoverVideo, 'categories-mosaic': CategoriesMosaic, 'icon-columns': IconColumns,
  'products-slider': ProductsSlider, 'social-posts': SocialPosts, 'social-marquee': SocialMarquee, 'shop-look': ShopLook, 'press-quotes': PressQuotes,
  'cover-duo': CoverDuo, 'promo-lines': PromoLines, 'story-sunburst': StorySunburst, 'perks-rows': PerksRows, 'before-after': BeforeAfter,
  'cover-mega': CoverMega, 'products-rows': ProductsRows, 'names-list': NamesList, 'statement-sticker': StatementSticker,
  'products-words': ProductsWords, 'values-portrait': ValuesPortrait, 'campaign-strip': CampaignStrip, 'block-split': BlockSplit, 'letters-split': LettersSplit,
  'statement-offset': StatementOffset, 'products-nicknames': ProductsNicknames, 'verbs-photo': VerbsPhoto, 'origins-arches': OriginsArches,
  'packs-kits': PacksKits,
  'pay-ways': PayWays,
  'cover-kinetic': CoverKinetic, 'statement-rotate': StatementRotate, 'story-carousel': StoryCarousel, 'tabs-photo': TabsPhoto, 'strip-velocity': StripVelocity,
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

/** One library section on its own (V2, spec 2026-11-14 v2-library-sections: a written home places tested sections among its
 *  own). `index` is the section's place on the page (0 = first, which some covers read). Mount LibraryScript once per page. */
export function LibraryBlockView({ block, index = 1 }: { block: LibraryBlock; index?: number }) {
  const Section = SECTIONS[block.type];
  return Section ? <Section block={withPhotos(block)} index={index} /> : null;
}

/** The two behaviours CSS cannot do: copy a promo code, and fit one huge word to the width (poster cover, wordmark). */
export function LibraryScript() {
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
    // Before and after: the range moves the cut line.
    const compare = (event: Event) => {
      const input = event.target as HTMLInputElement | null;
      if (input?.matches?.('[data-lb-compare]')) input.parentElement?.style.setProperty('--lb-cut', `${input.value}%`);
    };
    // Steps as panels (owner 2026-11-13): a tab or the arrow shows that step.
    const step = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest?.('[data-lb-step],[data-lb-step-next]');
      const card = button?.closest('.lb-stepp__card');
      if (!button || !card) return;
      const texts = [...card.querySelectorAll<HTMLElement>('[data-lb-step-text]')], now = texts.findIndex(text => !text.hidden);
      const to = button.hasAttribute('data-lb-step-next') ? (now + 1) % texts.length : Number(button.getAttribute('data-lb-step'));
      texts.forEach((text, n) => { text.hidden = n !== to; });
      card.querySelectorAll('[data-lb-step]').forEach((tab, n) => tab.setAttribute('aria-selected', String(n === to)));
    };
    // Visítanos (owner 2026-11-13): the map loads only when the visitor asks for it, in place of the photo.
    const map = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest?.('[data-lb-map]');
      const box = button?.closest('.lb-visit__media');
      if (!button || !box || box.querySelector('iframe')) return;
      const frame = document.createElement('iframe');
      frame.src = `https://www.google.com/maps?q=${encodeURIComponent(button.getAttribute('data-lb-map') ?? '')}&output=embed`;
      frame.title = 'Mapa';
      frame.className = 'lb-visit__map';
      frame.setAttribute('loading', 'lazy');
      frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      box.appendChild(frame);
      box.setAttribute('data-map', '');
    };
    document.addEventListener('click', copy);
    document.addEventListener('click', map);
    document.addEventListener('click', step);
    document.addEventListener('input', compare);
    window.addEventListener('resize', fit);
    fit();
    void document.fonts?.ready.then(fit);
    return () => { document.removeEventListener('click', copy); document.removeEventListener('click', map); document.removeEventListener('click', step); document.removeEventListener('input', compare); window.removeEventListener('resize', fit); };
  }, []);
  return null;
}
