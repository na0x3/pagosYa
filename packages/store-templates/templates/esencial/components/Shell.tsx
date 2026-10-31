import { useState, type ReactNode, type CSSProperties } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store, copy, variants, photos, layout } from './store-data';
import { CardRibbons, CardTemplate, libraryCard, type LibraryBlock } from './library';

/** The rolled variant of a part (variety spec §2); the first catalogue id when the store has none. */
export const variant = (part: string, fallback: string) => { const value = variants[part]; return typeof value === 'string' && value ? value : fallback; };
import { IconLogIn, IconMapPin, IconMenu, IconMessageCircle, IconSearch, IconShoppingBag, IconX } from './icons';

const links = [{ label: 'Inicio', href: 'index.html' }, { label: 'Productos', href: 'productos.html' }, { label: 'Nuestra historia', href: 'index.html#historia' }];

export function Header() {
  const [open, setOpen] = useState(false);
  return <>
    {copy.announcement ? <div className="es-announce" data-es-announce={variant('announce', 'plain')}>
      <p className="es-announce__text">{copy.announcement}</p>
      {variant('announce', 'plain') === 'ticker' ? <p className="es-announce__track" aria-hidden="true">{[1, 2, 3, 4].map(n => <span key={n}>{copy.announcement}</span>)}</p> : null}
    </div> : null}
    <header className="es-header" data-es-header={variant('header', 'classic')}>
      <div className="es-header__start">
        <div className="es-store-menu" data-pagosya-store-menu="toggle" />
        <button type="button" className="es-icon-btn" data-store-menu-replaces aria-controls="es-menu" aria-expanded={open} aria-label="Abrir menú" onClick={() => setOpen(true)}><IconMenu /></button>
        <a className="es-logo" href="index.html">{store.logo ? <img src={store.logo} alt={store.name} /> : store.name}</a>
        <div className="es-store-menu-links" data-pagosya-store-menu="links" />
      </div>
      <nav className="es-header__links" aria-label="Principal" data-store-menu-replaces>{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
      <div className="es-header__end">
        <a className="es-icon-btn" href="buscar.html" aria-label="Buscar"><IconSearch /></a>
        <a className="es-icon-btn" data-pagosya-account="login" href="acceso-ingresar.html" aria-label="Mi cuenta"><IconLogIn /></a>
        <button type="button" className="es-icon-btn es-cart-btn" data-cart-open aria-label="Abrir carrito"><IconShoppingBag /><span className="es-cart-count" data-cart-count>0</span></button>
      </div>
    </header>
    <div className={open ? 'es-menu es-menu--open' : 'es-menu'} id="es-menu" aria-hidden={!open} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <nav className="es-menu__panel" aria-label="Principal">
        <button type="button" className="es-icon-btn es-menu__close" aria-label="Cerrar menú" onClick={() => setOpen(false)}><IconX /></button>
        {links.map(link => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}
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

export function Footer() {
  const tagline = copy.tagline || store.tagline;
  // store-data is `as const`: widen so an empty value still type-checks as text.
  const phone: string = store.phone;
  const footer = variant('footer', 'columns');
  // John Smedley sections (spec 2026-10-21): the `column` footer sits on a band of the store's hero photo.
  const band = footer === 'column' && photos.hero ? { ['--es-footer-photo' as string]: `url("${photos.hero}")` } as CSSProperties : undefined;
  return <footer className="es-footer" data-es-footer={footer} style={band}>
    {footer === 'bigname' ? <p className="es-footer__big" aria-hidden="true">{store.name}</p> : null}
    <div className="es-footer__grid">
      <div className="es-footer__brand">{store.logo ? <a className="es-footer__logo" href="index.html"><img src={store.logo} alt={store.name} /></a> : <p className="es-footer__name">{store.name}</p>}{tagline ? <p>{tagline}</p> : null}</div>
      <div><h2>Tienda</h2><nav aria-label="Tienda"><a href="productos.html">Todos los productos</a><a href="index.html#historia">Nuestra historia</a></nav></div>
      <div><h2>Ayuda</h2><nav data-pagosya-pages className="pagosya-info-nav es-footer__pages" aria-label="Información" /></div>
      {store.city || phone ? <div><h2>Contacto</h2>
        {store.city ? <p className="es-footer__line"><IconMapPin /> {store.city}</p> : null}
        {phone ? <a className="es-footer__line" href={`https://wa.me/${phone.replace(/\D/g, '')}`}><IconMessageCircle /> WhatsApp</a> : null}
      </div> : null}
    </div>
    {/* The newsletter: the email is typed right here, in a field the kit draws once signup is on (owner 2026-10-25). */}
    <div className="es-footer__news" data-pagosya-subscribe-block>
      <div><h2>Recibe novedades</h2><p>Lanzamientos y ofertas de {store.name} en tu correo.</p></div>
      <div className="es-footer__signup" data-pagosya-subscribe-inline data-track="newsletter" />
    </div>
    <p className="es-footer__legal">{'\u00a9'} {new Date().getFullYear()} {store.name} · Pagos seguros con pagosYa</p>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="es" data-es-button={variant('button', 'pill')} data-es-corners={variant('corners', 'soft')} data-es-density={variant('density', 'regular')} data-es-texture={variant('texture', 'none')} data-es-photos={variant('photos', 'natural')} data-es-titles={variant('titles', 'normal')}>
    <a className="es-skip" href="#contenido">Ir al contenido</a>
    <Header />
    {/* Section library stores: one product card on every page (owner 2026-10-31). */}
    {(layout as LibraryBlock[]).length ? <><CardTemplate card={libraryCard(layout as LibraryBlock[])} /><CardRibbons /></> : null}
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="es-status" />
  </div>;
}
