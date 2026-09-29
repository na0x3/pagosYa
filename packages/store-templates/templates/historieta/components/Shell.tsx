import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Novedades', href: 'index.html#novedades' },
  { label: 'Series', href: 'index.html#series' },
  { label: 'Colección', href: 'index.html#coleccion' },
  { label: 'Lectores', href: 'index.html#voces' },
];

function BagIcon() {
  return <svg className="hi-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="hi-header">
    <a className="hi-brand" href="index.html"><span className="hi-brand__name">{store.name}</span></a>
    <nav className="hi-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="hi-cart" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="hi-cart__count" data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="hi-footer">
    <p className="hi-footer__name">{store.name}</p>
    <p className="hi-footer__lead">{store.tagline || 'Cómics para leer, coleccionar y regalar.'}</p>
    <nav className="hi-footer__links" aria-label="Pie de página">
      {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      <a href="checkout.html">Mi pedido</a>
      <button type="button" className="hi-footer__link" data-cart-open>Ver carrito</button>
    </nav>
    <p className="hi-footer__note">{store.city ? `${store.city} · ` : ''}Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
  </footer>;
}

/** The cart overlay, its lines, the "added" stamp and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="hi-cartpanel">
        <header className="hi-cartpanel__head">
          <h2 className="hi-cartpanel__title">Tu pila de cómics</h2>
          <button type="button" className="hi-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="hi-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="hi-cartpanel__empty">
          <p className="hi-cartpanel__empty-title">¡Todavía no hay nada!</p>
          <p>Elige un cómic y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="hi-cartpanel__suggestions" />
        <div className="hi-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="hi-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="hi-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="hi-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="hi-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="hi-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="hi-line">
        <KitSlot kind="line" name="photo" as="img" className="hi-line__photo" />
        <div className="hi-line__info">
          <KitSlot kind="line" name="name" as="p" className="hi-line__name" />
          <KitSlot kind="line" name="option" as="p" className="hi-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="hi-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="hi-line__meta" />
          <KitSlot kind="line" name="quantity" className="hi-line__qty" />
        </div>
        <div className="hi-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="hi-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="hi-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="hi-added">
        <KitSlot kind="added" name="photo" as="img" className="hi-added__photo" />
        <div className="hi-added__copy">
          <p className="hi-added__stamp">¡Al carrito!</p>
          <KitSlot kind="added" name="message" as="p" className="hi-added__message" />
        </div>
        <button type="button" className="hi-added__open" data-cart-open>Ver pila</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="hi-review">
        <div className="hi-review__col hi-review__col--summary">
          <h2 className="hi-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="hi-review__summary" />
        </div>
        <div className="hi-review__col">
          <h2 className="hi-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="hi-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="hi">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="hi-status" />
  </div>;
}
