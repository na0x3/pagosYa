import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Equipo', href: 'index.html#equipo' },
  { label: 'Comparar', href: 'index.html#comparar' },
  { label: 'Lentes', href: 'index.html#lentes' },
  { label: 'Taller', href: 'index.html#taller' },
];

function PersonIcon() {
  return <svg className="vi-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="vi-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="vi-header">
    <a className="vi-brand" href="index.html">{store.name}</a>
    <div className="vi-bar">
      <nav className="vi-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
      <p className="vi-bar__promo">Envío asegurado en todo el país</p>
      <a className="vi-bar__icon" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
      <button type="button" className="vi-bar__icon" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="vi-bar__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="vi-footer">
    <div className="vi-footer__top">
      <div className="vi-footer__about">
        <p className="vi-footer__name">{store.name}</p>
        <p className="vi-footer__lead">{store.tagline || 'Cámaras y lentes elegidos para quien mira con atención.'}</p>
      </div>
      <nav className="vi-footer__col" aria-label="Tienda">
        <p className="vi-footer__heading">Tienda</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="vi-footer__col">
        <p className="vi-footer__heading">Tu compra</p>
        <button type="button" className="vi-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
        <p>{store.city ? `Desde ${store.city}` : 'Envíos a toda Bolivia'}</p>
      </div>
    </div>
    <p className="vi-footer__note">Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
  </footer>;
}

/** The cart drawer, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="vi-cartpanel">
        <header className="vi-cartpanel__head">
          <h2 className="vi-cartpanel__title">Tu equipo</h2>
          <button type="button" className="vi-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="vi-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="vi-cartpanel__empty">
          <p className="vi-cartpanel__empty-title">Tu carrito está vacío</p>
          <p>Elige una cámara o un lente y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="vi-cartpanel__suggestions" />
        <div className="vi-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="vi-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="vi-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="vi-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="vi-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="vi-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="vi-line">
        <KitSlot kind="line" name="photo" as="img" className="vi-line__photo" />
        <div className="vi-line__info">
          <KitSlot kind="line" name="name" as="p" className="vi-line__name" />
          <KitSlot kind="line" name="option" as="p" className="vi-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="vi-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="vi-line__meta" />
          <KitSlot kind="line" name="quantity" className="vi-line__qty" />
        </div>
        <div className="vi-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="vi-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="vi-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="vi-added">
        <KitSlot kind="added" name="photo" as="img" className="vi-added__photo" />
        <div className="vi-added__copy">
          <p className="vi-added__kicker">Añadido</p>
          <KitSlot kind="added" name="message" as="p" className="vi-added__message" />
        </div>
        <button type="button" className="vi-added__open" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="vi-review">
        <div className="vi-review__col vi-review__col--summary">
          <h2 className="vi-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="vi-review__summary" />
        </div>
        <div className="vi-review__col">
          <h2 className="vi-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="vi-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="vi">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="vi-status" />
  </div>;
}
