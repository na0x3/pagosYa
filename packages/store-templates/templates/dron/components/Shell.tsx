import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Modelos', href: 'index.html#modelos' },
  { label: 'Vuelo', href: 'index.html#vuelo' },
  { label: 'Accesorios', href: 'index.html#accesorios' },
  { label: 'Licencia', href: 'index.html#licencia' },
];

function PersonIcon() {
  return <svg className="dr-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="dr-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <>
    <p className="dr-ticker">Envío al día siguiente en todos los sistemas</p>
    <header className="dr-header">
      <div className="dr-box">
        <a className="dr-brand" href="index.html">{store.name}</a>
        <details className="dr-menu">
          <summary aria-label="Menú"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></summary>
          <nav className="dr-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
        </details>
      </div>
      <div className="dr-tools">
        <a className="dr-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
        <button type="button" className="dr-tool" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="dr-tool__count" data-cart-count>0</span></button>
      </div>
    </header>
  </>;
}

export function Footer() {
  return <footer className="dr-footer">
    <div className="dr-footer__top">
      <div>
        <p className="dr-footer__name">{store.name}</p>
        <p className="dr-footer__lead">{store.tagline || 'Drones y accesorios para volar más lejos.'}</p>
      </div>
      <nav className="dr-footer__col" aria-label="Tienda">
        <p className="dr-footer__heading">Tienda</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="dr-footer__col">
        <p className="dr-footer__heading">Tu compra</p>
        <button type="button" className="dr-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
      </div>
    </div>
    <p className="dr-footer__note">{store.city ? `${store.city} · ` : ''}Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
  </footer>;
}

/** The cart sheet, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="dr-cartpanel">
        <header className="dr-cartpanel__head">
          <h2 className="dr-cartpanel__title">Tu pedido</h2>
          <button type="button" className="dr-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="dr-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="dr-cartpanel__empty">
          <p className="dr-cartpanel__empty-title">Carrito vacío</p>
          <p>Elige un dron y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="dr-cartpanel__suggestions" />
        <div className="dr-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="dr-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="dr-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="dr-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="dr-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="dr-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="dr-line">
        <KitSlot kind="line" name="photo" as="img" className="dr-line__photo" />
        <div className="dr-line__info">
          <KitSlot kind="line" name="name" as="p" className="dr-line__name" />
          <KitSlot kind="line" name="option" as="p" className="dr-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="dr-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="dr-line__meta" />
          <KitSlot kind="line" name="quantity" className="dr-line__qty" />
        </div>
        <div className="dr-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="dr-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="dr-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="dr-added">
        <KitSlot kind="added" name="photo" as="img" className="dr-added__photo" />
        <div className="dr-added__copy">
          <p className="dr-added__kicker">Agregado</p>
          <KitSlot kind="added" name="message" as="p" className="dr-added__message" />
        </div>
        <button type="button" className="dr-added__open" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="dr-review">
        <div className="dr-review__col dr-review__col--summary">
          <h2 className="dr-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="dr-review__summary" />
        </div>
        <div className="dr-review__col">
          <h2 className="dr-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="dr-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="dr">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="dr-status" />
  </div>;
}
