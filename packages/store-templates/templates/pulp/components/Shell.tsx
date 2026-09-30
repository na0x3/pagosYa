import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Inicio', href: 'index.html' },
  { label: 'La bóveda', href: 'index.html#boveda' },
  { label: 'Épocas', href: 'index.html#epocas' },
  { label: 'Raros', href: 'index.html#raros' },
];

function BagIcon() {
  return <svg className="pu-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Announce() {
  return <p className="pu-announce"><span>Envíos cuidados en funda y cartón rígido</span><span>Ediciones raras con certificado</span><span>Nuevas llegadas cada semana</span></p>;
}

export function Header() {
  return <header className="pu-header">
    <a className="pu-brand" href="index.html"><span className="pu-brand__badge" aria-hidden="true">★</span><span className="pu-brand__name">{store.name}</span></a>
    <nav className="pu-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="pu-tools">
      <a className="pu-tool pu-tool--text" href="checkout.html">Mi pedido</a>
      <button type="button" className="pu-tool" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="pu-tool__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="pu-footer">
    <p className="pu-footer__name">{store.name}</p>
    <p className="pu-footer__lead">{store.tagline || 'Cómics de colección, protegidos y con historia.'}</p>
    <nav className="pu-footer__links" aria-label="Pie de página">
      {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      <a href="checkout.html">Mi pedido</a>
      <button type="button" className="pu-footer__link" data-cart-open>Ver carrito</button>
    </nav>
    <p className="pu-footer__note">{store.city ? `${store.city} · ` : ''}Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart overlay, its lines, the "added" stamp and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="pu-cartpanel">
        <header className="pu-cartpanel__head">
          <h2 className="pu-cartpanel__title">Tu pila</h2>
          <button type="button" className="pu-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="pu-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="pu-cartpanel__empty">
          <p className="pu-cartpanel__empty-title">Nada por aquí</p>
          <p>Elige un número de la bóveda y aparecerá en tu pila.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="pu-cartpanel__suggestions" />
        <div className="pu-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="pu-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="pu-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="pu-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="pu-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="pu-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="pu-line">
        <KitSlot kind="line" name="photo" as="img" className="pu-line__photo" />
        <div className="pu-line__info">
          <KitSlot kind="line" name="name" as="p" className="pu-line__name" />
          <KitSlot kind="line" name="option" as="p" className="pu-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="pu-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="pu-line__meta" />
          <KitSlot kind="line" name="quantity" className="pu-line__qty" />
        </div>
        <div className="pu-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="pu-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="pu-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="pu-added">
        <KitSlot kind="added" name="photo" as="img" className="pu-added__photo" />
        <div className="pu-added__copy">
          <p className="pu-added__stamp">Agregado</p>
          <KitSlot kind="added" name="message" as="p" className="pu-added__message" />
        </div>
        <button type="button" className="pu-added__open" data-cart-open>Ver pila</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="pu-review">
        <div className="pu-review__col pu-review__col--summary">
          <h2 className="pu-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="pu-review__summary" />
        </div>
        <div className="pu-review__col">
          <h2 className="pu-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="pu-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="pu">
    <Announce />
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="pu-status" />
  </div>;
}
