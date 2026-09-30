import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Por edad', href: 'index.html#edades' },
  { label: 'Juguetes', href: 'index.html#juguetes' },
  { label: 'La madera', href: 'index.html#madera' },
  { label: 'Regalos', href: 'index.html#regalos' },
];

function BagIcon() {
  return <svg className="tr-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="tr-header">
    <a className="tr-brand" href="index.html"><span className="tr-brand__dot" aria-hidden="true" />{store.name}</a>
    <nav className="tr-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="tr-tools">
      <a className="tr-pill" href="index.html#edades">Comprar por edad</a>
      <button type="button" className="tr-cart" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="tr-cart__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="tr-footer">
    <div className="tr-footer__top">
      <div className="tr-footer__about">
        <p className="tr-footer__name">{store.name}</p>
        <p className="tr-footer__lead">{store.tagline || 'Juguetes de madera hechos para jugar de verdad.'}</p>
      </div>
      <nav className="tr-footer__col" aria-label="Tienda">
        <p className="tr-footer__heading">Tienda</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="tr-footer__col">
        <p className="tr-footer__heading">Tu compra</p>
        <button type="button" className="tr-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
        <p>{store.city ? `Desde ${store.city}` : 'Envíos a toda Bolivia'}</p>
      </div>
    </div>
    <p className="tr-footer__note">Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
  </footer>;
}

/** The cart drawer, its lines, the "added" bubble and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="tr-cartpanel">
        <header className="tr-cartpanel__head">
          <h2 className="tr-cartpanel__title">Tu carrito</h2>
          <button type="button" className="tr-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="tr-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="tr-cartpanel__empty">
          <p className="tr-cartpanel__empty-title">¡Aún no hay juguetes!</p>
          <p>Elige uno y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="tr-cartpanel__suggestions" />
        <div className="tr-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="tr-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="tr-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="tr-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="tr-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="tr-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="tr-line">
        <KitSlot kind="line" name="photo" as="img" className="tr-line__photo" />
        <div className="tr-line__info">
          <KitSlot kind="line" name="name" as="p" className="tr-line__name" />
          <KitSlot kind="line" name="option" as="p" className="tr-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="tr-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="tr-line__meta" />
          <KitSlot kind="line" name="quantity" className="tr-line__qty" />
        </div>
        <div className="tr-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="tr-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="tr-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="tr-added">
        <KitSlot kind="added" name="photo" as="img" className="tr-added__photo" />
        <div className="tr-added__copy">
          <p className="tr-added__kicker">¡Al carrito!</p>
          <KitSlot kind="added" name="message" as="p" className="tr-added__message" />
        </div>
        <button type="button" className="tr-added__open" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="tr-review">
        <div className="tr-review__col tr-review__col--summary">
          <h2 className="tr-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="tr-review__summary" />
        </div>
        <div className="tr-review__col">
          <h2 className="tr-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="tr-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="tr">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="tr-status" />
  </div>;
}
