import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Equipo', href: 'index.html#equipo' },
  { label: 'Expedición', href: 'index.html#expedicion' },
  { label: 'Categorías', href: 'index.html#categorias' },
  { label: 'Opiniones', href: 'index.html#resenas' },
];

function PersonIcon() {
  return <svg className="se-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function PackIcon() {
  return <svg className="se-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M7 8a5 5 0 0 1 10 0v12H7V8Z" /><path d="M9 4V3h6v1M7 13h10" /></svg>;
}

export function Announce() {
  return <p className="se-announce"><span>Envío gratis desde Bs 500</span><span>Garantía de por vida en costuras</span><span>Prueba 30 días</span></p>;
}

export function Header() {
  return <header className="se-header">
    <a className="se-brand" href="index.html">{store.name}</a>
    <nav className="se-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="se-tools">
      <a className="se-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
      <button type="button" className="se-tool" data-cart-open aria-label="Abrir carrito"><PackIcon /><span className="se-tool__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="se-footer">
    <div className="se-footer__top">
      <div className="se-footer__about">
        <p className="se-footer__name">{store.name}</p>
        <p className="se-footer__lead">{store.tagline || 'Equipo pensado para el camino largo.'}</p>
      </div>
      <nav className="se-footer__col" aria-label="Tienda">
        <p className="se-footer__heading">Tienda</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="se-footer__col">
        <p className="se-footer__heading">Tu compra</p>
        <button type="button" className="se-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
        <p>{store.city ? `Desde ${store.city}` : 'Envíos a toda Bolivia'}</p>
      </div>
    </div>
    <p className="se-footer__note">Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
  </footer>;
}

/** The cart sheet, its lines, the "added" ribbon and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="se-cartpanel">
        <header className="se-cartpanel__head">
          <h2 className="se-cartpanel__title">Tu equipo</h2>
          <button type="button" className="se-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="se-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="se-cartpanel__empty">
          <p className="se-cartpanel__empty-title">Tu mochila está vacía</p>
          <p>Agrega equipo y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="se-cartpanel__suggestions" />
        <div className="se-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="se-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="se-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="se-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="se-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="se-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="se-line">
        <KitSlot kind="line" name="photo" as="img" className="se-line__photo" />
        <div className="se-line__info">
          <KitSlot kind="line" name="name" as="p" className="se-line__name" />
          <KitSlot kind="line" name="option" as="p" className="se-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="se-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="se-line__meta" />
          <KitSlot kind="line" name="quantity" className="se-line__qty" />
        </div>
        <div className="se-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="se-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="se-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="se-added">
        <KitSlot kind="added" name="photo" as="img" className="se-added__photo" />
        <div className="se-added__copy">
          <p className="se-added__kicker">En tu mochila</p>
          <KitSlot kind="added" name="message" as="p" className="se-added__message" />
        </div>
        <button type="button" className="se-added__open" data-cart-open>Ver equipo</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="se-review">
        <div className="se-review__col se-review__col--summary">
          <h2 className="se-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="se-review__summary" />
        </div>
        <div className="se-review__col">
          <h2 className="se-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="se-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="se">
    <Announce />
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="se-status" />
  </div>;
}
