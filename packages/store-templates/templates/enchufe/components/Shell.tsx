import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Todo', href: 'index.html#mas-vendidos' },
  { label: 'Audio', href: 'index.html#comparar' },
  { label: 'Carga', href: 'index.html#categorias' },
  { label: 'Hogar inteligente', href: 'index.html#categorias' },
  { label: 'Novedades', href: 'index.html#escritorio' },
];

function CloseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;
}

export function Announce() {
  return <p className="ec-announce">Envío gratis desde Bs 500</p>;
}

/** The black rounded bar, inset 12px: store name left, nav centred, the "Carrito (0)" pill right. On a phone the nav becomes a swipeable row. */
export function Header() {
  return <header className="ec-header">
    <a className="ec-logo" href="index.html">{store.name}</a>
    <nav className="ec-nav" aria-label="Principal">{links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ec-cart" data-cart-open>Carrito <span className="ec-cart__count">(<span data-cart-count>0</span>)</span></button>
  </header>;
}

export function Footer() {
  return <footer className="ec-footer">
    <div className="ec-footer__top">
      <div className="ec-footer__about">
        <p className="ec-footer__name">{store.name}</p>
        <p className="ec-footer__lead">Gadgets y accesorios que se usan todos los días, con garantía, soporte de verdad y precios claros.</p>
      </div>
      <nav className="ec-footer__col" aria-label="Pie de página">
        <p className="ec-footer__heading">Tienda</p>
        {links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="ec-footer__col">
        <p className="ec-footer__heading">Ayuda</p>
        <a href="index.html#soporte">Garantía y soporte</a>
        <a href="index.html#preguntas">Preguntas frecuentes</a>
        <button type="button" className="ec-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
      </div>
    </div>
    <p className="ec-footer__note"><span>{store.city ? `Enviamos desde ${store.city} a toda Bolivia` : 'Envíos a toda Bolivia'}</span><span>Pagos seguros con QR y tarjeta</span></p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The centred white cart card, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="ec-cartpanel">
        <header className="ec-cartpanel__head">
          <h2 className="ec-cartpanel__title">Tu carrito</h2>
          <button type="button" className="ec-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><CloseIcon /></button>
        </header>
        <KitSlot kind="cart" name="lines" className="ec-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="ec-cartpanel__empty">
          <p className="ec-cartpanel__empty-title">Tu carrito está vacío</p>
          <p>Audífonos, cargadores y más: elige algo útil y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="ec-cartpanel__suggestions" />
        <div className="ec-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="ec-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="ec-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="ec-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="ec-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="ec-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="ec-line">
        <KitSlot kind="line" name="photo" as="img" className="ec-line__photo" />
        <div className="ec-line__info">
          <KitSlot kind="line" name="name" as="p" className="ec-line__name" />
          <KitSlot kind="line" name="option" as="p" className="ec-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="ec-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="ec-line__meta" />
          <KitSlot kind="line" name="quantity" className="ec-line__qty" />
        </div>
        <div className="ec-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="ec-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="ec-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="ec-added">
        <KitSlot kind="added" name="photo" as="img" className="ec-added__photo" />
        <div className="ec-added__copy">
          <p className="ec-added__kicker"><span className="ec-added__dot" aria-hidden="true" />Agregado al carrito</p>
          <KitSlot kind="added" name="message" as="p" className="ec-added__message" />
        </div>
        <button type="button" className="ec-added__open" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="ec-review">
        <div className="ec-review__col ec-review__col--summary">
          <h2 className="ec-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="ec-review__summary" />
        </div>
        <div className="ec-review__col">
          <h2 className="ec-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="ec-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ec">
    <Announce />
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ec-status" />
  </div>;
}
