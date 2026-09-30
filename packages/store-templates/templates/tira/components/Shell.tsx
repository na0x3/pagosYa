import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Inicio', href: 'index.html' },
  { label: 'Estantes', href: 'index.html#estantes' },
  { label: 'Géneros', href: 'index.html#generos' },
  { label: 'Club', href: 'index.html#lectura' },
];

function BagIcon() {
  return <svg className="ti-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="ti-header">
    <a className="ti-brand" href="index.html">{store.name}</a>
    <nav className="ti-pills" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ti-cart" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="ti-cart__count" data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="ti-footer">
    <p className="ti-footer__name">{store.name}</p>
    <p className="ti-footer__lead">{store.tagline || 'Cómics, manga y novelas gráficas para leer sin parar.'}</p>
    <nav className="ti-footer__links" aria-label="Pie de página">
      {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      <a href="checkout.html">Mi pedido</a>
      <button type="button" className="ti-footer__link" data-cart-open>Ver carrito</button>
    </nav>
    <p className="ti-footer__note">{store.city ? `${store.city} · ` : ''}Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
  </footer>;
}

/** The cart sheet, its lines, the "added" bubble and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="ti-cartpanel">
        <header className="ti-cartpanel__head">
          <h2 className="ti-cartpanel__title">Tu pila</h2>
          <button type="button" className="ti-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="ti-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="ti-cartpanel__empty">
          <p className="ti-cartpanel__empty-title">Nada por aquí</p>
          <p>Elige un tomo y aparecerá en tu pila.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="ti-cartpanel__suggestions" />
        <div className="ti-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="ti-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="ti-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="ti-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="ti-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="ti-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="ti-line">
        <KitSlot kind="line" name="photo" as="img" className="ti-line__photo" />
        <div className="ti-line__info">
          <KitSlot kind="line" name="name" as="p" className="ti-line__name" />
          <KitSlot kind="line" name="option" as="p" className="ti-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="ti-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="ti-line__meta" />
          <KitSlot kind="line" name="quantity" className="ti-line__qty" />
        </div>
        <div className="ti-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="ti-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="ti-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="ti-added">
        <KitSlot kind="added" name="photo" as="img" className="ti-added__photo" />
        <div className="ti-added__copy">
          <p className="ti-added__kicker">¡A la pila!</p>
          <KitSlot kind="added" name="message" as="p" className="ti-added__message" />
        </div>
        <button type="button" className="ti-added__open" data-cart-open>Ver pila</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="ti-review">
        <div className="ti-review__col ti-review__col--summary">
          <h2 className="ti-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="ti-review__summary" />
        </div>
        <div className="ti-review__col">
          <h2 className="ti-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="ti-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ti">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ti-status" />
  </div>;
}
