import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Piezas', href: 'index.html#piezas' },
  { label: 'Colección', href: 'index.html#coleccion' },
  { label: 'Materiales', href: 'index.html#materiales' },
  { label: 'Cuidado', href: 'index.html#cuidado' },
];

function PersonIcon() {
  return <svg className="pl-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="pl-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="pl-header">
    <a className="pl-brand" href="index.html">{store.name}</a>
    <nav className="pl-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="pl-tools">
      <a className="pl-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
      <button type="button" className="pl-tool" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="pl-tool__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="pl-footer">
    <div className="pl-footer__top">
      <div className="pl-footer__about">
        <p className="pl-footer__name">{store.name}</p>
        <p className="pl-footer__lead">{store.tagline || 'Joyas de plata y cuentas, hechas para acompañarte todos los días.'}</p>
      </div>
      <nav className="pl-footer__col" aria-label="Tienda">
        <p className="pl-footer__heading">Tienda</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="pl-footer__col">
        <p className="pl-footer__heading">Tu compra</p>
        <button type="button" className="pl-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
        <p>{store.city ? `Desde ${store.city}` : 'Envíos a toda Bolivia'}</p>
      </div>
    </div>
    <p className="pl-footer__note">Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart drawer, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="pl-cartpanel">
        <header className="pl-cartpanel__head">
          <h2 className="pl-cartpanel__title">Tu carrito</h2>
          <button type="button" className="pl-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="pl-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="pl-cartpanel__empty">
          <p className="pl-cartpanel__empty-title">Tu carrito está vacío</p>
          <p>Elige una pieza y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="pl-cartpanel__suggestions" />
        <div className="pl-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="pl-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="pl-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="pl-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="pl-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="pl-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="pl-line">
        <KitSlot kind="line" name="photo" as="img" className="pl-line__photo" />
        <div className="pl-line__info">
          <KitSlot kind="line" name="name" as="p" className="pl-line__name" />
          <KitSlot kind="line" name="option" as="p" className="pl-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="pl-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="pl-line__meta" />
          <KitSlot kind="line" name="quantity" className="pl-line__qty" />
        </div>
        <div className="pl-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="pl-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="pl-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="pl-added">
        <KitSlot kind="added" name="photo" as="img" className="pl-added__photo" />
        <div className="pl-added__copy">
          <p className="pl-added__kicker">Añadido</p>
          <KitSlot kind="added" name="message" as="p" className="pl-added__message" />
        </div>
        <button type="button" className="pl-added__open" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="pl-review">
        <div className="pl-review__col pl-review__col--summary">
          <h2 className="pl-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="pl-review__summary" />
        </div>
        <div className="pl-review__col">
          <h2 className="pl-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="pl-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="pl">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="pl-status" />
  </div>;
}
