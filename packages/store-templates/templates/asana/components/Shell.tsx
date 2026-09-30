import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Inicio', href: 'index.html' },
  { label: 'Prendas', href: 'index.html#prendas' },
  { label: 'Práctica', href: 'index.html#practica' },
  { label: 'Clases', href: 'index.html#clases' },
];

function PersonIcon() {
  return <svg className="as-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="as-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="as-header">
    <a className="as-brand" href="index.html">{store.name}</a>
    <nav className="as-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="as-tools">
      <a className="as-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
      <button type="button" className="as-tool" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="as-tool__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="as-footer">
    <div className="as-footer__top">
      <div className="as-footer__about">
        <p className="as-footer__name">{store.name}</p>
        <p className="as-footer__lead">{store.tagline || 'Ropa para moverte con calma y con intención.'}</p>
      </div>
      <nav className="as-footer__col" aria-label="Tienda">
        <p className="as-footer__heading">Tienda</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="as-footer__col">
        <p className="as-footer__heading">Tu compra</p>
        <button type="button" className="as-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
        <p>{store.city ? `Desde ${store.city}` : 'Envíos a toda Bolivia'}</p>
      </div>
    </div>
    <p className="as-footer__note">Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
  </footer>;
}

/** The cart drawer, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="as-cartpanel">
        <header className="as-cartpanel__head">
          <h2 className="as-cartpanel__title">Tu carrito</h2>
          <button type="button" className="as-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="as-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="as-cartpanel__empty">
          <p className="as-cartpanel__empty-title">Tu carrito está vacío</p>
          <p>Elige una prenda y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="as-cartpanel__suggestions" />
        <div className="as-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="as-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="as-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="as-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="as-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="as-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="as-line">
        <KitSlot kind="line" name="photo" as="img" className="as-line__photo" />
        <div className="as-line__info">
          <KitSlot kind="line" name="name" as="p" className="as-line__name" />
          <KitSlot kind="line" name="option" as="p" className="as-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="as-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="as-line__meta" />
          <KitSlot kind="line" name="quantity" className="as-line__qty" />
        </div>
        <div className="as-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="as-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="as-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="as-added">
        <KitSlot kind="added" name="photo" as="img" className="as-added__photo" />
        <div className="as-added__copy">
          <p className="as-added__kicker">Añadido</p>
          <KitSlot kind="added" name="message" as="p" className="as-added__message" />
        </div>
        <button type="button" className="as-added__open" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="as-review">
        <div className="as-review__col as-review__col--summary">
          <h2 className="as-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="as-review__summary" />
        </div>
        <div className="as-review__col">
          <h2 className="as-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="as-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="as">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="as-status" />
  </div>;
}
