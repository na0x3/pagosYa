import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Obras', href: 'index.html#obras' },
  { label: 'La artista', href: 'index.html#artista' },
  { label: 'Coleccionar', href: 'index.html#coleccionar' },
  { label: 'Exposiciones', href: 'index.html#exposiciones' },
];

function PersonIcon() {
  return <svg className="ga-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="ga-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="ga-header">
    <a className="ga-brand" href="index.html"><span className="ga-brand__mark" aria-hidden="true" />{store.name}</a>
    <nav className="ga-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="ga-tools">
      <a className="ga-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
      <button type="button" className="ga-tool" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="ga-tool__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="ga-footer">
    <div className="ga-footer__top">
      <div className="ga-footer__about">
        <p className="ga-footer__name">{store.name}</p>
        <p className="ga-footer__lead">{store.tagline || 'Obras originales, con certificado y envío enmarcado.'}</p>
      </div>
      <nav className="ga-footer__col" aria-label="Galería">
        <p className="ga-footer__heading">Galería</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="ga-footer__col">
        <p className="ga-footer__heading">Tu compra</p>
        <button type="button" className="ga-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
        <p>{store.city ? `Desde ${store.city}` : 'Envíos a toda Bolivia'}</p>
      </div>
    </div>
    <p className="ga-footer__note">Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart drawer, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="ga-cartpanel">
        <header className="ga-cartpanel__head">
          <h2 className="ga-cartpanel__title">Tu selección</h2>
          <button type="button" className="ga-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="ga-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="ga-cartpanel__empty">
          <p className="ga-cartpanel__empty-title">Aún no eliges ninguna obra</p>
          <p>Cuando lo hagas, aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="ga-cartpanel__suggestions" />
        <div className="ga-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="ga-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="ga-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="ga-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="ga-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="ga-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="ga-line">
        <KitSlot kind="line" name="photo" as="img" className="ga-line__photo" />
        <div className="ga-line__info">
          <KitSlot kind="line" name="name" as="p" className="ga-line__name" />
          <KitSlot kind="line" name="option" as="p" className="ga-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="ga-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="ga-line__meta" />
          <KitSlot kind="line" name="quantity" className="ga-line__qty" />
        </div>
        <div className="ga-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="ga-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="ga-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="ga-added">
        <KitSlot kind="added" name="photo" as="img" className="ga-added__photo" />
        <div className="ga-added__copy">
          <p className="ga-added__kicker">Añadida a tu selección</p>
          <KitSlot kind="added" name="message" as="p" className="ga-added__message" />
        </div>
        <button type="button" className="ga-added__open" data-cart-open>Ver selección</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="ga-review">
        <div className="ga-review__col ga-review__col--summary">
          <h2 className="ga-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="ga-review__summary" />
        </div>
        <div className="ga-review__col">
          <h2 className="ga-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="ga-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ga">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ga-status" />
  </div>;
}
