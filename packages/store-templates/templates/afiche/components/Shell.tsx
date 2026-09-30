import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Afiches', href: 'index.html#afiches' },
  { label: 'Tamaños', href: 'index.html#tamanos' },
  { label: 'Marcos', href: 'index.html#marcos' },
  { label: 'Artistas', href: 'index.html#artistas' },
];

const ticker = ['Envío a todo el país', 'Papel de 250 g', 'Impresión giclée', 'Marcos de madera'];

function PersonIcon() {
  return <svg className="af-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="af-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Announce() {
  return <div className="af-ticker" aria-label="Novedades de la tienda"><p>{[...ticker, ...ticker].map((item, index) => <span key={index}>{item}<i aria-hidden="true">✦</i></span>)}</p></div>;
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
    <p className="af-footer__name">{store.name}</p>
    <p className="af-footer__lead">{store.tagline || 'Afiches y láminas para paredes con carácter.'}</p>
    <nav className="af-footer__links" aria-label="Pie de página">
      {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      <a href="checkout.html">Mi pedido</a>
      <button type="button" className="af-footer__link" data-cart-open>Ver carrito</button>
    </nav>
    <p className="af-footer__note">{store.city ? `${store.city} · ` : ''}Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
  </footer>;
}

/** The cart drawer, its lines, the "added" stamp and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="af-cartpanel">
        <header className="af-cartpanel__head">
          <h2 className="af-cartpanel__title">Tu carrito</h2>
          <button type="button" className="af-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="af-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="af-cartpanel__empty">
          <p className="af-cartpanel__empty-title">Nada por aquí</p>
          <p>Elige un afiche y aparecerá aquí.</p>
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
          <p className="af-added__stamp">Al carrito</p>
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
    <Announce />
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="af-status" />
  </div>;
}
