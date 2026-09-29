import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Piezas', href: 'index.html#piezas' },
  { label: 'Proceso', href: 'index.html#proceso' },
  { label: 'Taller', href: 'index.html#taller' },
  { label: 'Pedidos', href: 'index.html#pedidos' },
];

function PersonIcon() {
  return <svg className="af-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="af-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="af-header">
    <a className="af-brand" href="index.html">{store.name}</a>
    <nav className="af-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="af-tools">
      <a className="af-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
      <button type="button" className="af-tool" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="af-tool__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="af-footer">
    <div className="af-footer__top">
      <div className="af-footer__about">
        <p className="af-footer__name">{store.name}</p>
        <p className="af-footer__lead">{store.tagline || 'Cerámica hecha a mano, una pieza a la vez.'}</p>
      </div>
      <nav className="af-footer__col" aria-label="Tienda">
        <p className="af-footer__heading">Tienda</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="af-footer__col">
        <p className="af-footer__heading">Tu compra</p>
        <button type="button" className="af-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
        <p>{store.city ? `Desde ${store.city}` : 'Envíos a toda Bolivia'}</p>
      </div>
    </div>
    <p className="af-footer__note">Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
  </footer>;
}

/** The cart overlay, its lines, the inline "added" strip and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="af-cartpanel">
        <header className="af-cartpanel__head">
          <h2 className="af-cartpanel__title">Tu carrito</h2>
          <button type="button" className="af-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="af-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="af-cartpanel__empty">
          <p className="af-cartpanel__empty-title">Tu carrito está vacío</p>
          <p>Elige una pieza y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="af-cartpanel__suggestions" />
        <div className="af-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="af-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="af-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="af-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="af-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="af-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="af-line">
        <KitSlot kind="line" name="photo" as="img" className="af-line__photo" />
        <div className="af-line__info">
          <KitSlot kind="line" name="name" as="p" className="af-line__name" />
          <KitSlot kind="line" name="option" as="p" className="af-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="af-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="af-line__meta" />
          <KitSlot kind="line" name="quantity" className="af-line__qty" />
        </div>
        <div className="af-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="af-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="af-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="af-added">
        <KitSlot kind="added" name="photo" as="img" className="af-added__photo" />
        <div className="af-added__copy">
          <p className="af-added__kicker">Añadida</p>
          <KitSlot kind="added" name="message" as="p" className="af-added__message" />
        </div>
        <button type="button" className="af-added__open" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="af-review">
        <div className="af-review__col af-review__col--summary">
          <h2 className="af-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="af-review__summary" />
        </div>
        <div className="af-review__col">
          <h2 className="af-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="af-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="af">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="af-status" />
  </div>;
}
