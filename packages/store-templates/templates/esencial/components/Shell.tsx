import { useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store, copy, variants, photos, layout } from './store-data';
import { CardRibbons, CardTemplate, ThemeMotion, libraryCard, type LibraryBlock } from './library';

/** The rolled variant of a part (variety spec §2); the first catalogue id when the store has none. */
export const variant = (part: string, fallback: string) => { const value = variants[part]; return typeof value === 'string' && value ? value : fallback; };
import { IconCircleUser, IconLogIn, IconMapPin, IconMenu, IconMessageCircle, IconSearch, IconShoppingBag, IconShoppingBasket, IconShoppingCart, IconUser, IconX } from './icons';

/** 34 templates (2026-10-31): the header glyphs of each theme — Palo Alto's person in a circle, a cart, a basket, or words. */
const HEADER_ICONS: Record<string, { account: typeof IconSearch; cart: typeof IconSearch }> = {
  line: { account: IconLogIn, cart: IconShoppingBag }, person: { account: IconCircleUser, cart: IconShoppingBag },
  cart: { account: IconUser, cart: IconShoppingCart }, basket: { account: IconUser, cart: IconShoppingBasket },
};

const links = [{ label: 'Inicio', href: 'index.html' }, { label: 'Productos', href: 'productos.html' }, { label: 'Nuestra historia', href: 'index.html#historia' }];

/** Owner 2026-10-31 («siguen con el toque de antes… producto, nuestra historia… repetitivo»): a template store's menu and footer are
 *  its theme's own — the theme's word for the shop, then the store's real categories (read from the live catalogue, so a new one
 *  shows up), then «Preguntas» when the home has them; never the same Inicio · Productos · Nuestra historia on every store. */
type NavLink = { label: string; href: string };
const FRAME: Record<string, { shop: string; footShop: string; footHelp: string; news?: [string, string] }> = {
  paloalto: { shop: 'Comprar', footShop: 'Comprar', footHelp: 'Servicio al cliente' },
  impulse: { shop: 'Todo', footShop: 'Colecciones', footHelp: 'Información' },
  motion: { shop: 'Equipo', footShop: 'Explorar', footHelp: 'Soporte' },
  focal: { shop: 'Catálogo', footShop: 'Catálogo', footHelp: 'Ayuda' },
  symmetry: { shop: 'Novedades', footShop: 'Tienda', footHelp: 'Atención' },
  broadcast: { shop: 'Piezas', footShop: 'Piezas', footHelp: 'Cuidado y envíos' },
  shrine: { shop: 'Fragancias', footShop: 'Productos', footHelp: 'Soporte' },
  shrine2: { shop: 'Comprar', footShop: 'Comprar', footHelp: 'Soporte' },
  gumdrop: { shop: 'Sabores', footShop: 'Snacks', footHelp: 'Hablemos' },
  amigos: { shop: 'La tienda', footShop: 'La tienda', footHelp: 'Ayuda' },
  majestuoso: { shop: 'Todo', footShop: 'Categorías', footHelp: 'Ayuda y soporte' },
  energia: { shop: 'Productos', footShop: 'Nuestra tienda', footHelp: 'Enlaces' },
  mordisco: { shop: 'Premios', footShop: 'Tienda', footHelp: 'Ayuda' },
  pancita: { shop: 'Comprar todo', footShop: 'Comprar', footHelp: 'Enlaces' },
  pecas: { shop: 'Comprar', footShop: 'Comprar', footHelp: 'Info' },
  crocante: { shop: 'Comprar', footShop: 'Comprar', footHelp: 'Aprende' },
};
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
/** The categories that hold products, as catalogue links (the kit's own category filter). */
function useCategoryLinks(): NavLink[] {
  const [list, setList] = useState<NavLink[]>([]);
  useEffect(() => {
    const data = (window as unknown as { PAGOSYA_CONFIG?: { data?: { categories?: Array<{ id?: string; name?: string }>; items?: Array<{ categoryId?: string }> } } }).PAGOSYA_CONFIG?.data;
    const used = new Set((data?.items ?? []).map(item => item.categoryId).filter(Boolean));
    setList((data?.categories ?? []).filter(category => category.id && category.name && used.has(category.id)).slice(0, 5)
      .map(category => ({ label: String(category.name), href: `productos.html?f_categoria=${encodeURIComponent(fold(String(category.id)))}` })));
  }, []);
  return list;
}
const libraryStore = () => (layout as LibraryBlock[]).length > 0;
const frame = () => FRAME[variant('theme', 'none')] ?? { shop: 'Tienda', footShop: 'Tienda', footHelp: 'Ayuda' };
/** The shop header's «Comprar» and short menu point at the one-product home's buy box: only where that page has one. */
const shopPage = () => variant('header', 'classic') === 'shop' && (layout as LibraryBlock[]).some(block => block.type === 'product-hero');

function useMenu(): NavLink[] {
  const categories = useCategoryLinks();
  if (!libraryStore()) return links;
  const faq = (layout as LibraryBlock[]).some(block => block.type === 'faq-split');
  // Premium landing (spec 2026-11-03): the shop header names the home's own parts.
  if (shopPage()) return [{ label: 'Producto', href: 'index.html#comprar' },
    ...((layout as LibraryBlock[]).some(block => block.type === 'variant-cards') ? [{ label: 'Colores', href: 'index.html#colores' }] : []), ...(faq ? [{ label: 'Preguntas', href: 'index.html#preguntas' }] : [])];
  return [{ label: frame().shop, href: 'productos.html' }, ...categories, ...(faq ? [{ label: 'Preguntas', href: 'index.html#preguntas' }] : [])];
}

/** Lively one-product stores (spec 2026-11-03): in the colourful mood a store with no logo image shows its name letter by letter,
 *  each letter coloured and bobbing (theme CSS); screen readers read the name once. */
function Wordmark() {
  if (store.logo) return <img src={store.logo} alt={store.name} />;
  if (variant('mood', 'calm') !== 'colourful') return <>{store.name}</>;
  return <><span className="lb-visually-hidden">{store.name}</span><span className="es-logo__letters" aria-hidden="true">
    {[...store.name].map((letter, at) => <span key={at} style={{ ['--i' as string]: at } as CSSProperties}>{letter === ' ' ? '\u00a0' : letter}</span>)}
  </span></>;
}

/** The kit hides a link to the colour cards when they do not draw (fewer than two photographed colours). */
const colourLink = (href: string) => href.endsWith('#colores') ? { 'data-needs-colour-cards': '' } : {};

export function Header() {
  const [open, setOpen] = useState(false);
  const menu = useMenu();
  return <>
    {copy.announcement ? <div className="es-announce" data-es-announce={variant('announce', 'plain')}>
      <p className="es-announce__text">{copy.announcement}</p>
      {variant('announce', 'plain') === 'ticker' ? <p className="es-announce__track" aria-hidden="true">{[1, 2, 3, 4].map(n => <span key={n}>{copy.announcement}</span>)}</p> : null}
    </div> : null}
    {/* Impulse (34 templates): a thin bar of the store's own pages above the header. */}
    {variant('utility', 'off') === 'pages' ? <div className="es-utility"><nav data-pagosya-pages className="pagosya-info-nav es-utility__pages" aria-label="Ayuda" /></div> : null}
    <header className="es-header" data-es-header={variant('header', 'classic')}>
      <div className="es-header__start">
        <div className="es-store-menu" data-pagosya-store-menu="toggle" />
        <button type="button" className="es-icon-btn" data-store-menu-replaces aria-controls="es-menu" aria-expanded={open} aria-label="Abrir menú" onClick={() => setOpen(true)}><IconMenu /></button>
        <a className="es-logo" href="index.html"><Wordmark /></a>
        <div className="es-store-menu-links" data-pagosya-store-menu="links" />
      </div>
      {/* Maximize (34 templates): a big search box in the header itself. */}
      {variant('header', 'classic') === 'search' ? <form className="es-header__search" role="search" method="get" action="buscar.html"><input type="search" name="q" placeholder="¿Qué estás buscando hoy?" aria-label="Buscar productos" /><button type="submit" aria-label="Buscar"><IconSearch /></button></form> : null}
      <nav className="es-header__links" aria-label="Principal" data-store-menu-replaces>{menu.map(link => <a key={link.href} href={link.href} {...colourLink(link.href)}>{link.label}</a>)}</nav>
      <div className="es-header__end">
        {variant('icons', 'line') === 'text' ? <>
          <a className="es-text-btn" href="buscar.html">Buscar</a>
          <a className="es-text-btn" data-pagosya-account="login" href="acceso-ingresar.html">Cuenta</a>
          <button type="button" className="es-text-btn es-cart-btn" data-cart-open aria-label="Abrir carrito">Carrito (<span data-cart-count>0</span>)</button>
        </> : <HeaderIcons />}
        {shopPage() ? <a className="es-btn es-header__buy" href="index.html#comprar">Comprar</a> : null}
      </div>
    </header>
    <div className={open ? 'es-menu es-menu--open' : 'es-menu'} id="es-menu" aria-hidden={!open} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <nav className="es-menu__panel" aria-label="Principal">
        <button type="button" className="es-icon-btn es-menu__close" aria-label="Cerrar menú" onClick={() => setOpen(false)}><IconX /></button>
        {menu.map(link => <a key={link.href} href={link.href} {...colourLink(link.href)} onClick={() => setOpen(false)}>{link.label}</a>)}
      </nav>
    </div>
    <CartTemplate>
      <div className="es-cart">
        <header className="es-cart__head">
          <h2 className="es-cart__title">Tu carrito</h2>
          <button type="button" className="es-icon-btn" data-cart-close aria-label="Cerrar carrito"><IconX /></button>
        </header>
        <KitSlot kind="cart" name="lines" className="es-cart__lines" />
        <KitSlot kind="cart" name="empty" className="es-cart__empty">
          <p>Tu carrito está vacío.</p>
          <a className="es-link" href="productos.html">Ver productos</a>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="es-cart__suggestions" />
        <div className="es-cart__foot">
          <KitSlot kind="cart" name="savings" className="es-cart__savings" />
          <KitSlot kind="cart" name="total" className="es-cart__total" />
          <KitSlot kind="cart" name="note" className="es-cart__note" />
          <KitSlot kind="cart" name="action" className="es-cart__action" />
          <KitSlot kind="cart" name="policies" className="es-cart__note" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="es-line">
        <KitSlot kind="line" name="photo" as="img" className="es-line__photo" />
        <div className="es-line__info">
          <KitSlot kind="line" name="name" as="p" className="es-line__name" />
          <KitSlot kind="line" name="option" as="p" className="es-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="es-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="es-line__meta" />
          <KitSlot kind="line" name="quantity" className="es-line__qty" />
        </div>
        <div className="es-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="es-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="es-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="es-added">
        <KitSlot kind="added" name="photo" as="img" className="es-added__photo" />
        <KitSlot kind="added" name="message" as="p" className="es-added__message" />
        <button type="button" className="es-btn es-btn--accent es-added__open" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="es-review">
        <div className="es-review__col">
          <h2 className="es-h3">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="es-review__summary" />
        </div>
        <div className="es-review__col">
          <h2 className="es-h3">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="es-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

/** A store photo no section of the home names (by slot or by address). */
function sparePhoto(): string {
  const home = JSON.stringify(layout);
  const map = photos as Record<string, unknown>;
  // The same photo can sit under two names (hero and its slot): what the home shows is compared by address.
  const shown = new Set([...home.matchAll(/"slot:([^"]+)"/g)].map(match => map[match[1]]).filter(Boolean));
  const entry = Object.entries(map).find(([, src]) => typeof src === 'string' && src && !shown.has(src) && !home.includes(src));
  return entry ? String(entry[1]) : '';
}

export function Footer() {
  const tagline = copy.tagline || store.tagline;
  // store-data is `as const`: widen so an empty value still type-checks as text.
  const phone: string = store.phone;
  const footer = variant('footer', 'columns');
  // John Smedley sections (spec 2026-10-21): the `column` footer sits on a band of the store's hero photo.
  // Template frame variety (2026-11-03): the `photo` footer (Brightland / Pipeline) fills one side with a store photo the home does not
  // already show (each photo once); with none spare it is drawn without one.
  const footerPhoto = footer === 'photo' ? sparePhoto() : footer === 'column' ? photos.hero : '';
  const band = footerPhoto ? { ['--es-footer-photo' as string]: `url("${footerPhoto}")` } as CSSProperties : undefined;
  const categories = useCategoryLinks();
  const themed = libraryStore();
  const words = frame();
  // A template home with its own newsletter section never shows a second one in the footer.
  const news = !themed || !(layout as LibraryBlock[]).some(block => block.type === 'newsletter-split');
  return <footer className="es-footer" data-es-footer={footer} style={band}>
    {footer === 'bigname' ? <p className="es-footer__big" aria-hidden="true">{store.name}</p> : null}
    {/* BonBonBon: the tagline (or the name) scrolling on a strip above the footer; still under reduced motion. */}
    {footer === 'ticker' ? <div className="es-footer__ticker" aria-hidden="true"><p>{[0, 1].map(half => <span key={half}>{Array.from({ length: 4 }, (_, i) => <span key={i}>{tagline || store.name}<i>{'\u2726'}</i></span>)}</span>)}</p></div> : null}
    <div className="es-footer__grid">
      <div className="es-footer__brand">{store.logo ? <a className="es-footer__logo" href="index.html"><img src={store.logo} alt={store.name} /></a> : <p className="es-footer__name">{store.name}</p>}{tagline ? <p>{tagline}</p> : null}</div>
      {themed ? <div><h2>{words.footShop}</h2><nav aria-label={words.footShop}><a href="productos.html">Ver todo</a>{categories.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav></div>
        : <div><h2>Tienda</h2><nav aria-label="Tienda"><a href="productos.html">Todos los productos</a><a href="index.html#historia">Nuestra historia</a></nav></div>}
      <div><h2>{themed ? words.footHelp : 'Ayuda'}</h2><nav data-pagosya-pages className="pagosya-info-nav es-footer__pages" aria-label="Información" /></div>
      {store.city || phone ? <div className="es-footer__contact"><h2>{footer === 'visit' ? 'Visítanos' : 'Contacto'}</h2>
        {store.city ? <p className="es-footer__line"><IconMapPin /> {store.city}</p> : null}
        {phone ? <a className="es-footer__line" href={`https://wa.me/${phone.replace(/\D/g, '')}`}><IconMessageCircle /> WhatsApp</a> : null}
      </div> : null}
    </div>
    {/* The newsletter: the email is typed right here, in a field the kit draws once signup is on (owner 2026-10-25). */}
    {news ? <div className="es-footer__news" data-pagosya-subscribe-block>
      <div><h2>Recibe novedades</h2><p>Lanzamientos y ofertas de {store.name} en tu correo.</p></div>
      <div className="es-footer__signup" data-pagosya-subscribe-inline data-track="newsletter" />
    </div> : null}
    <p className="es-footer__legal">{'\u00a9'} {new Date().getFullYear()} {store.name} · Pagos seguros con pagosYa</p>
    {/* Graza / Ridge / Scratch: the store's name across the whole bottom edge. */}
    {footer === 'wordmark' ? <p className="es-footer__word" aria-hidden="true" style={{ ['--es-word-len' as string]: Math.max(4, store.name.length) } as CSSProperties}>{store.name}</p> : null}
  </footer>;
}

function HeaderIcons() {
  const set = HEADER_ICONS[variant('icons', 'line')] ?? HEADER_ICONS.line;
  return <>
    <a className="es-icon-btn" href="buscar.html" aria-label="Buscar"><IconSearch /></a>
    <a className="es-icon-btn" data-pagosya-account="login" href="acceso-ingresar.html" aria-label="Mi cuenta"><set.account /></a>
    <button type="button" className="es-icon-btn es-cart-btn" data-cart-open aria-label="Abrir carrito"><set.cart /><span className="es-cart-count" data-cart-count>0</span></button>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="es" data-es-theme={variant('theme', 'none')} data-es-mood={variant('mood', 'calm')} data-pya-lively={variant('theme', 'none') === 'unico' ? '' : undefined} data-es-icons={variant('icons', 'line')} data-es-button={variant('button', 'pill')} data-es-corners={variant('corners', 'soft')} data-es-density={variant('density', 'regular')} data-es-texture={variant('texture', 'none')} data-es-photos={variant('photos', 'natural')} data-es-titles={variant('titles', 'normal')}>
    <a className="es-skip" href="#contenido">Ir al contenido</a>
    <Header />
    {/* Section library stores: one product card on every page (owner 2026-10-31). */}
    {(layout as LibraryBlock[]).length ? <><CardTemplate card={libraryCard(layout as LibraryBlock[])} /><CardRibbons /><ThemeMotion /></> : null}
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="es-status" />
  </div>;
}
