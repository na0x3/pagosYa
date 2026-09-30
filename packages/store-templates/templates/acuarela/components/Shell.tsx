import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Pinturas', href: 'index.html#pinturas' },
  { label: 'Sets', href: 'index.html#sets' },
  { label: 'Consejos', href: 'index.html#consejos' },
  { label: 'Estudio', href: 'index.html#estudio' },
];

export function Announce() {
  return <p className="ac-announce">Descuentos en sets · Envío rápido a todo el país · Pincel de regalo desde tu primera compra</p>;
}

export function Header() {
  return <header className="ac-header">
    <a className="ac-brand" href="index.html">{store.name}</a>
    <nav className="ac-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="ac-tools">
      <a className="ac-account" href="checkout.html">Mi pedido</a>
      <button type="button" className="ac-cart" data-cart-open aria-label="Abrir carrito">Carrito <span className="ac-cart__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="ac-footer">
    <p className="ac-footer__name">{store.name}</p>
    <p className="ac-footer__lead">{store.tagline || 'Todo para pintar, dibujar y crear.'}</p>
    <nav className="ac-footer__links" aria-label="Pie de página">
      {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      <a href="checkout.html">Mi pedido</a>
      <button type="button" className="ac-footer__link" data-cart-open>Ver carrito</button>
    </nav>
    <p className="ac-footer__note">{store.city ? `${store.city} · ` : ''}Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart drawer, its lines, the "added" bubble and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="ac-cartpanel">
        <header className="ac-cartpanel__head">
          <h2 className="ac-cartpanel__title">Tu carrito</h2>
          <button type="button" className="ac-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="ac-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="ac-cartpanel__empty">
          <p className="ac-cartpanel__empty-title">Todavía nada</p>
          <p>Elige colores y pinceles, y aparecerán aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="ac-cartpanel__suggestions" />
        <div className="ac-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="ac-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="ac-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="ac-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="ac-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="ac-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="ac-line">
        <KitSlot kind="line" name="photo" as="img" className="ac-line__photo" />
        <div className="ac-line__info">
          <KitSlot kind="line" name="name" as="p" className="ac-line__name" />
          <KitSlot kind="line" name="option" as="p" className="ac-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="ac-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="ac-line__meta" />
          <KitSlot kind="line" name="quantity" className="ac-line__qty" />
        </div>
        <div className="ac-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="ac-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="ac-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="ac-added">
        <KitSlot kind="added" name="photo" as="img" className="ac-added__photo" />
        <div className="ac-added__copy">
          <p className="ac-added__kicker">¡Listo!</p>
          <KitSlot kind="added" name="message" as="p" className="ac-added__message" />
        </div>
        <button type="button" className="ac-added__open" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="ac-review">
        <div className="ac-review__col ac-review__col--summary">
          <h2 className="ac-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="ac-review__summary" />
        </div>
        <div className="ac-review__col">
          <h2 className="ac-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="ac-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ac">
    <Announce />
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ac-status" />
  </div>;
}
