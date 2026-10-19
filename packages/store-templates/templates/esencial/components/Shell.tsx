import { useState, type ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store, copy } from './store-data';
import { IconLogIn, IconMapPin, IconMenu, IconMessageCircle, IconSearch, IconShoppingBag, IconX } from './icons';

const links = [{ label: 'Inicio', href: 'index.html' }, { label: 'Productos', href: 'productos.html' }, { label: 'Nuestra historia', href: 'index.html#historia' }];

export function Header() {
  const [open, setOpen] = useState(false);
  return <>
    {copy.announcement ? <p className="es-announce">{copy.announcement}</p> : null}
    <header className="es-header">
      <div className="es-header__start">
        <button type="button" className="es-icon-btn" aria-controls="es-menu" aria-expanded={open} aria-label="Abrir menú" onClick={() => setOpen(true)}><IconMenu /></button>
        <a className="es-logo" href="index.html">{store.logo ? <img src={store.logo} alt={store.name} /> : store.name}</a>
      </div>
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
  return <footer className="es-footer">
    <div className="es-footer__grid">
      <div className="es-footer__brand"><p className="es-footer__name">{store.name}</p>{tagline ? <p>{tagline}</p> : null}</div>
      <div><h2>Tienda</h2><nav aria-label="Tienda"><a href="productos.html">Todos los productos</a><a href="index.html#historia">Nuestra historia</a></nav></div>
      <div><h2>Ayuda</h2><nav data-pagosya-pages className="pagosya-info-nav es-footer__pages" aria-label="Información" /></div>
      <div><h2>Contacto</h2>
        {store.city ? <p className="es-footer__line"><IconMapPin /> {store.city}</p> : null}
        {phone ? <a className="es-footer__line" href={`https://wa.me/${phone.replace(/\D/g, '')}`}><IconMessageCircle /> WhatsApp</a> : null}
        <a className="es-footer__line" data-pagosya-account="login" href="acceso-ingresar.html">Mi cuenta</a>
      </div>
    </div>
    <p className="es-footer__legal">{'\u00a9'} {new Date().getFullYear()} {store.name} · Pagos seguros con pagosYa</p>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="es">
    <a className="es-skip" href="#contenido">Ir al contenido</a>
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="es-status" />
  </div>;
}
