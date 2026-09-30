import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Todo', href: 'index.html#novedades' },
  { label: 'Categorías', href: 'index.html#categorias' },
  { label: 'Equipo', href: 'index.html#equipo' },
  { label: 'Entrenar', href: 'index.html#entrenamiento' },
];

function BoltIcon() {
  return <svg className="ar-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>;
}

function PersonIcon() {
  return <svg className="ar-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="ar-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="ar-header">
    <a className="ar-brand" href="index.html"><span className="ar-brand__bolt"><BoltIcon /></span>{store.name}</a>
    <nav className="ar-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="ar-tools">
      <a className="ar-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
      <button type="button" className="ar-tool ar-tool--cart" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="ar-tool__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="ar-footer">
    <div className="ar-footer__top">
      <div className="ar-footer__about">
        <p className="ar-footer__name">{store.name}</p>
        <p className="ar-footer__lead">{store.tagline || 'Camisetas, equipo y todo lo que necesitas para tu deporte.'}</p>
      </div>
      <nav className="ar-footer__col" aria-label="Tienda">
        <p className="ar-footer__heading">Tienda</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="ar-footer__col">
        <p className="ar-footer__heading">Tu compra</p>
        <button type="button" className="ar-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
        <p>{store.city ? `Desde ${store.city}` : 'Envíos a toda Bolivia'}</p>
      </div>
    </div>
    <p className="ar-footer__note">Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart drawer, its lines, the "added" ribbon and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="ar-cartpanel">
        <header className="ar-cartpanel__head">
          <h2 className="ar-cartpanel__title">Tu equipo</h2>
          <button type="button" className="ar-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="ar-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="ar-cartpanel__empty">
          <p className="ar-cartpanel__empty-title">Vestuario vacío</p>
          <p>Elige tu equipo y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="ar-cartpanel__suggestions" />
        <div className="ar-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="ar-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="ar-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="ar-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="ar-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="ar-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="ar-line">
        <KitSlot kind="line" name="photo" as="img" className="ar-line__photo" />
        <div className="ar-line__info">
          <KitSlot kind="line" name="name" as="p" className="ar-line__name" />
          <KitSlot kind="line" name="option" as="p" className="ar-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="ar-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="ar-line__meta" />
          <KitSlot kind="line" name="quantity" className="ar-line__qty" />
        </div>
        <div className="ar-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="ar-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="ar-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="ar-added">
        <KitSlot kind="added" name="photo" as="img" className="ar-added__photo" />
        <div className="ar-added__copy">
          <p className="ar-added__kicker">¡En tu equipo!</p>
          <KitSlot kind="added" name="message" as="p" className="ar-added__message" />
        </div>
        <button type="button" className="ar-added__open" data-cart-open>Ver equipo</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="ar-review">
        <div className="ar-review__col ar-review__col--summary">
          <h2 className="ar-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="ar-review__summary" />
        </div>
        <div className="ar-review__col">
          <h2 className="ar-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="ar-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ar">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ar-status" />
  </div>;
}
