import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Tés', href: 'index.html#tes' },
  { label: 'Familias', href: 'index.html#familias' },
  { label: 'Ceremonia', href: 'index.html#ceremonia' },
  { label: 'Suscripción', href: 'index.html#suscripcion' },
  { label: 'Reseñas', href: 'index.html#resenas' },
];

function FlowerMark() {
  return <svg className="in-icon" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="12" r="2.2" /><path d="M12 9.8C12 6 10.5 4 12 2.5 13.5 4 12 6 12 9.8ZM14.2 12c3.8 0 5.8-1.5 7.3 0-1.5 1.5-3.5 0-7.3 0ZM12 14.2c0 3.8 1.5 5.8 0 7.3-1.5-1.5 0-3.5 0-7.3ZM9.8 12c-3.8 0-5.8 1.5-7.3 0 1.5-1.5 3.5 0 7.3 0Z" /></svg>;
}

function PersonIcon() {
  return <svg className="in-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="in-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="in-header">
    <div className="in-header__top">
      <p className="in-header__social">Té de hoja entera · Envíos a toda Bolivia</p>
      <a className="in-brand" href="index.html"><FlowerMark /><span>{store.name}</span></a>
      <div className="in-tools">
        <a className="in-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
        <button type="button" className="in-tool" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="in-tool__count" data-cart-count>0</span></button>
      </div>
    </div>
    <nav className="in-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
  </header>;
}

export function Footer() {
  return <footer className="in-footer">
    <div className="in-footer__top">
      <div>
        <p className="in-footer__name">{store.name}</p>
        <p className="in-footer__lead">{store.tagline || 'Té de hoja entera, elegido y tostado con calma.'}</p>
      </div>
      <nav className="in-footer__col" aria-label="Tienda">
        <p className="in-footer__heading">Tienda</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="in-footer__col">
        <p className="in-footer__heading">Tu compra</p>
        <button type="button" className="in-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
      </div>
    </div>
    <p className="in-footer__note">{store.city ? `${store.city} · ` : ''}Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart drawer, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="in-cartpanel">
        <header className="in-cartpanel__head">
          <h2 className="in-cartpanel__title">Tu pedido</h2>
          <button type="button" className="in-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="in-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="in-cartpanel__empty">
          <p className="in-cartpanel__empty-title">Tu taza está vacía</p>
          <p>Elige un té y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="in-cartpanel__suggestions" />
        <div className="in-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="in-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="in-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="in-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="in-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="in-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="in-line">
        <KitSlot kind="line" name="photo" as="img" className="in-line__photo" />
        <div className="in-line__info">
          <KitSlot kind="line" name="name" as="p" className="in-line__name" />
          <KitSlot kind="line" name="option" as="p" className="in-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="in-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="in-line__meta" />
          <KitSlot kind="line" name="quantity" className="in-line__qty" />
        </div>
        <div className="in-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="in-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="in-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="in-added">
        <KitSlot kind="added" name="photo" as="img" className="in-added__photo" />
        <div className="in-added__copy">
          <p className="in-added__kicker">Agregado</p>
          <KitSlot kind="added" name="message" as="p" className="in-added__message" />
        </div>
        <button type="button" className="in-added__open" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="in-review">
        <div className="in-review__col in-review__col--summary">
          <h2 className="in-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="in-review__summary" />
        </div>
        <div className="in-review__col">
          <h2 className="in-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="in-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="in">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="in-status" />
  </div>;
}
