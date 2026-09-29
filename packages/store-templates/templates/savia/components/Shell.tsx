import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const left = [
  { label: 'Productos', href: 'index.html#productos' },
  { label: 'Ingredientes', href: 'index.html#ingredientes' },
];
const right = [
  { label: 'Ritual', href: 'index.html#ritual' },
  { label: 'Nuestra historia', href: 'index.html#historia' },
];
const links = [...left, ...right];

function BagIcon() {
  return <svg className="sv-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Announce() {
  return <p className="sv-announce">Envío gratis desde Bs 300 · Ingredientes de Bolivia · Hecho en pequeños lotes</p>;
}

export function Header() {
  return <header className="sv-header">
    <nav className="sv-nav sv-nav--left" aria-label="Principal">{left.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <a className="sv-brand" href="index.html"><span>{store.name}</span></a>
    <div className="sv-right">
      <nav className="sv-nav sv-nav--right" aria-label="Secundaria">{right.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
      <button type="button" className="sv-cart" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="sv-cart__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="sv-footer">
    <div className="sv-footer__top">
      <div className="sv-footer__about">
        <p className="sv-footer__name">{store.name}</p>
        <p className="sv-footer__lead">{store.tagline || 'Jabones y velas hechos a mano con ingredientes de la tierra.'}</p>
      </div>
      <nav className="sv-footer__col" aria-label="Tienda">
        <p className="sv-footer__heading">Tienda</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="sv-footer__col">
        <p className="sv-footer__heading">Tu compra</p>
        <button type="button" className="sv-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
        <p>{store.city ? `Desde ${store.city}` : 'Envíos a toda Bolivia'}</p>
      </div>
    </div>
    <p className="sv-footer__note">Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
  </footer>;
}

/** The cart drawer, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="sv-cartpanel">
        <header className="sv-cartpanel__head">
          <h2 className="sv-cartpanel__title">Tu carrito</h2>
          <button type="button" className="sv-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="sv-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="sv-cartpanel__empty">
          <p className="sv-cartpanel__empty-title">Tu carrito está vacío</p>
          <p>Elige un jabón o una vela y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="sv-cartpanel__suggestions" />
        <div className="sv-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="sv-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="sv-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="sv-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="sv-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="sv-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="sv-line">
        <KitSlot kind="line" name="photo" as="img" className="sv-line__photo" />
        <div className="sv-line__info">
          <KitSlot kind="line" name="name" as="p" className="sv-line__name" />
          <KitSlot kind="line" name="option" as="p" className="sv-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="sv-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="sv-line__meta" />
          <KitSlot kind="line" name="quantity" className="sv-line__qty" />
        </div>
        <div className="sv-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="sv-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="sv-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="sv-added">
        <KitSlot kind="added" name="photo" as="img" className="sv-added__photo" />
        <div className="sv-added__copy">
          <p className="sv-added__kicker">Añadido</p>
          <KitSlot kind="added" name="message" as="p" className="sv-added__message" />
        </div>
        <button type="button" className="sv-added__open" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="sv-review">
        <div className="sv-review__col sv-review__col--summary">
          <h2 className="sv-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="sv-review__summary" />
        </div>
        <div className="sv-review__col">
          <h2 className="sv-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="sv-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="sv">
    <Announce />
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="sv-status" />
  </div>;
}
