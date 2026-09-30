import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Tienda', href: 'index.html#mas-vendidos' },
  { label: 'Estampas', href: 'index.html#estampas' },
  { label: 'Taller', href: 'index.html#hecho-a-mano' },
  { label: 'Opiniones', href: 'index.html#resenas' },
];

function PersonIcon() {
  return <svg className="bo-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="bo-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Announce() {
  return <p className="bo-announce">Estampados a mano en El Alto · Envíos a toda Bolivia</p>;
}

export function Header() {
  return <header className="bo-header">
    <a className="bo-brand" href="index.html">
      <span className="bo-brand__name">{store.name}</span>
      <span className="bo-brand__tag">{store.tagline || 'Bolsos estampados a mano'}</span>
    </a>
    <nav className="bo-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="bo-tools">
      <a className="bo-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /><span className="bo-tool__label">Mi pedido</span></a>
      <button type="button" className="bo-tool bo-tool--cart" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="bo-tool__label">Carrito</span><span className="bo-tool__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="bo-footer">
    <div className="bo-footer__top">
      <div className="bo-footer__about">
        <p className="bo-footer__lead">Bolsos de lona estampados a mano, pensados para usarse todos los días y durar años.</p>
        <p className="bo-footer__pay">Pagos seguros con QR y tarjeta</p>
      </div>
      <nav className="bo-footer__col" aria-label="Tienda">
        <p className="bo-footer__heading">Tienda</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="bo-footer__col">
        <p className="bo-footer__heading">Tu compra</p>
        <button type="button" className="bo-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
        <p>{store.city ? `Desde ${store.city}` : 'Envíos a toda Bolivia'}</p>
      </div>
    </div>
    <p className="bo-footer__mark" aria-hidden="true">{store.name}</p>
    <p className="bo-footer__note">{store.name} · Hecho en Bolivia</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart drawer, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="bo-cartpanel">
        <header className="bo-cartpanel__head">
          <h2 className="bo-cartpanel__title">Tu carrito</h2>
          <button type="button" className="bo-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="bo-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="bo-cartpanel__empty">
          <p className="bo-cartpanel__empty-title">Tu carrito está vacío</p>
          <p>Elige un bolso con carácter y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="bo-cartpanel__suggestions" />
        <div className="bo-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="bo-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="bo-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="bo-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="bo-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="bo-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="bo-line">
        <KitSlot kind="line" name="photo" as="img" className="bo-line__photo" />
        <div className="bo-line__info">
          <KitSlot kind="line" name="name" as="p" className="bo-line__name" />
          <KitSlot kind="line" name="option" as="p" className="bo-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="bo-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="bo-line__meta" />
          <KitSlot kind="line" name="quantity" className="bo-line__qty" />
        </div>
        <div className="bo-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="bo-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="bo-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="bo-added">
        <KitSlot kind="added" name="photo" as="img" className="bo-added__photo" />
        <div className="bo-added__copy">
          <p className="bo-added__kicker">¡Listo!</p>
          <KitSlot kind="added" name="message" as="p" className="bo-added__message" />
        </div>
        <button type="button" className="bo-added__open" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="bo-review">
        <div className="bo-review__col bo-review__col--summary">
          <h2 className="bo-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="bo-review__summary" />
        </div>
        <div className="bo-review__col">
          <h2 className="bo-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="bo-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="bo">
    <Announce />
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="bo-status" />
  </div>;
}
