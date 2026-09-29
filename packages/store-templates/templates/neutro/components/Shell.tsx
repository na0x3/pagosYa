import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Todo', href: 'index.html#vendidos' },
  { label: 'Más vendidos', href: 'index.html#vendidos' },
  { label: 'Ofertas', href: 'index.html#destacado' },
  { label: 'Nuevo', href: 'index.html#destacado' },
  { label: 'Nosotros', href: 'index.html#historia' },
  { label: 'Preguntas', href: 'index.html#preguntas' },
];

function PersonIcon() {
  return <svg className="ne-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="ne-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="ne-header">
    <p className="ne-promo">Envíos a todo el país · Pago seguro con QR y tarjeta</p>
    <div className="ne-bar">
      <a className="ne-brand" href="index.html">{store.name}</a>
      <nav className="ne-nav" aria-label="Principal">{links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}</nav>
      <div className="ne-tools">
        <a className="ne-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
        <button type="button" className="ne-tool" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="ne-tool__count" data-cart-count>0</span></button>
      </div>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="ne-footer">
    <div className="ne-footer__top">
      <div>
        <p className="ne-footer__name">{store.name}</p>
        <p className="ne-footer__lead">{store.tagline || 'Productos bien hechos, enviados con cuidado.'}</p>
      </div>
      <nav className="ne-footer__col" aria-label="Tienda">
        <p className="ne-footer__heading">Tienda</p>
        <a href="index.html#vendidos">Más vendidos</a>
        <a href="index.html#historia">Nosotros</a>
        <a href="index.html#preguntas">Preguntas</a>
      </nav>
      <div className="ne-footer__col">
        <p className="ne-footer__heading">Tu compra</p>
        <button type="button" className="ne-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
      </div>
    </div>
    <p className="ne-footer__note">{store.city ? `${store.city} · ` : ''}Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
  </footer>;
}

/** The cart drawer, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="ne-cartpanel">
        <header className="ne-cartpanel__head">
          <h2 className="ne-cartpanel__title">Tu carrito</h2>
          <button type="button" className="ne-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="ne-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="ne-cartpanel__empty">
          <p className="ne-cartpanel__empty-title">Tu carrito está vacío</p>
          <p>Agrega un producto y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="ne-cartpanel__suggestions" />
        <div className="ne-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="ne-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="ne-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="ne-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="ne-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="ne-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="ne-line">
        <KitSlot kind="line" name="photo" as="img" className="ne-line__photo" />
        <div className="ne-line__info">
          <KitSlot kind="line" name="name" as="p" className="ne-line__name" />
          <KitSlot kind="line" name="option" as="p" className="ne-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="ne-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="ne-line__meta" />
          <KitSlot kind="line" name="quantity" className="ne-line__qty" />
        </div>
        <div className="ne-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="ne-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="ne-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="ne-added">
        <KitSlot kind="added" name="photo" as="img" className="ne-added__photo" />
        <div className="ne-added__copy">
          <p className="ne-added__kicker">Agregado</p>
          <KitSlot kind="added" name="message" as="p" className="ne-added__message" />
        </div>
        <button type="button" className="ne-added__open" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="ne-review">
        <div className="ne-review__col ne-review__col--summary">
          <h2 className="ne-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="ne-review__summary" />
        </div>
        <div className="ne-review__col">
          <h2 className="ne-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="ne-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ne">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ne-status" />
  </div>;
}
