import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Servicios', href: 'index.html#servicios' },
  { label: 'Proyectos', href: 'index.html#proyectos' },
  { label: 'Proceso', href: 'index.html#proceso' },
  { label: 'Opiniones', href: 'index.html#resenas' },
];

function CartIcon() {
  return <svg className="ob-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Announce() {
  return <p className="ob-announce">Visita técnica a domicilio · Presupuesto por escrito · Garantía de obra</p>;
}

export function Header() {
  return <header className="ob-header">
    <a className="ob-brand" href="index.html">
      <span className="ob-brand__mark" aria-hidden="true" />
      <span className="ob-brand__name">{store.name}</span>
    </a>
    <nav className="ob-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="ob-tools">
      <a className="ob-getquote" href="index.html#servicios">Cotizar</a>
      <button type="button" className="ob-tool" data-cart-open aria-label="Abrir carrito"><CartIcon /><span className="ob-tool__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="ob-footer">
    <div className="ob-footer__top">
      <div className="ob-footer__about">
        <p className="ob-footer__lead">{store.tagline || 'Construimos, remodelamos y entregamos a tiempo.'}</p>
        <p className="ob-footer__pay">Pagos seguros con QR y tarjeta</p>
      </div>
      <nav className="ob-footer__col" aria-label="Servicios">
        <p className="ob-footer__heading">Servicios</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="ob-footer__col">
        <p className="ob-footer__heading">Tu pedido</p>
        <button type="button" className="ob-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
        <p>{store.city ? `Obras en ${store.city}` : 'Obras en todo el país'}</p>
      </div>
    </div>
    <p className="ob-footer__note">{store.name} · Hecho en Bolivia</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart drawer, its lines, the inline "added" strip and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="ob-cartpanel">
        <header className="ob-cartpanel__head">
          <h2 className="ob-cartpanel__title">Tu pedido</h2>
          <button type="button" className="ob-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="ob-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="ob-cartpanel__empty">
          <p className="ob-cartpanel__empty-title">Aún no eliges ningún servicio</p>
          <p>Agrega un paquete y te contactamos para coordinar la visita.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="ob-cartpanel__suggestions" />
        <div className="ob-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="ob-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="ob-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="ob-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="ob-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="ob-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="ob-line">
        <KitSlot kind="line" name="photo" as="img" className="ob-line__photo" />
        <div className="ob-line__info">
          <KitSlot kind="line" name="name" as="p" className="ob-line__name" />
          <KitSlot kind="line" name="option" as="p" className="ob-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="ob-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="ob-line__meta" />
          <KitSlot kind="line" name="quantity" className="ob-line__qty" />
        </div>
        <div className="ob-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="ob-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="ob-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="ob-added">
        <KitSlot kind="added" name="photo" as="img" className="ob-added__photo" />
        <div className="ob-added__copy">
          <p className="ob-added__kicker">Agregado</p>
          <KitSlot kind="added" name="message" as="p" className="ob-added__message" />
        </div>
        <button type="button" className="ob-added__open" data-cart-open>Ver pedido</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="ob-review">
        <div className="ob-review__col ob-review__col--summary">
          <h2 className="ob-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="ob-review__summary" />
        </div>
        <div className="ob-review__col">
          <h2 className="ob-review__heading">Contacto y pago</h2>
          <KitSlot kind="review" name="fields" className="ob-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ob">
    <Announce />
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ob-status" />
  </div>;
}
