import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Piezas', href: 'index.html#piezas' },
  { label: 'El oficio', href: 'index.html#oficio' },
  { label: 'Materiales', href: 'index.html#materiales' },
  { label: 'Regalos', href: 'index.html#regalos' },
];

function PersonIcon() {
  return <svg className="at-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="at-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Announce() {
  return <p className="at-announce"><span>Empaque de regalo incluido en cada pedido</span><span>Cuero curtido de forma vegetal</span><span>Hecho a mano en pequeñas series</span></p>;
}

export function Header() {
  const monogram = (store.name.trim()[0] || 'A').toUpperCase();
  return <header className="at-header">
    <nav className="at-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <a className="at-brand" href="index.html" aria-label={store.name}><span className="at-brand__mono" aria-hidden="true">{monogram}</span><span className="at-brand__name">{store.name}</span></a>
    <div className="at-tools">
      <a className="at-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
      <button type="button" className="at-tool" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="at-tool__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="at-footer">
    <div className="at-footer__top">
      <div className="at-footer__about">
        <p className="at-footer__name">{store.name}</p>
        <p className="at-footer__lead">{store.tagline || 'Marroquinería hecha a mano, para acompañarte por años.'}</p>
      </div>
      <nav className="at-footer__col" aria-label="Tienda">
        <p className="at-footer__heading">Tienda</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="at-footer__col">
        <p className="at-footer__heading">Tu compra</p>
        <button type="button" className="at-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
        <p>{store.city ? `Desde ${store.city}` : 'Envíos a toda Bolivia'}</p>
      </div>
    </div>
    <p className="at-footer__note">Pagos seguros con QR y tarjeta · Hecho en Bolivia</p>
  </footer>;
}

/** The cart drawer, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="at-cartpanel">
        <header className="at-cartpanel__head">
          <h2 className="at-cartpanel__title">Tu selección</h2>
          <button type="button" className="at-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="at-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="at-cartpanel__empty">
          <p className="at-cartpanel__empty-title">Tu selección está vacía</p>
          <p>Elige una pieza y aparecerá aquí.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="at-cartpanel__suggestions" />
        <div className="at-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="at-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="at-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="at-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="at-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="at-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="at-line">
        <KitSlot kind="line" name="photo" as="img" className="at-line__photo" />
        <div className="at-line__info">
          <KitSlot kind="line" name="name" as="p" className="at-line__name" />
          <KitSlot kind="line" name="option" as="p" className="at-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="at-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="at-line__meta" />
          <KitSlot kind="line" name="quantity" className="at-line__qty" />
        </div>
        <div className="at-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="at-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="at-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="at-added">
        <KitSlot kind="added" name="photo" as="img" className="at-added__photo" />
        <div className="at-added__copy">
          <p className="at-added__kicker">Añadida a tu selección</p>
          <KitSlot kind="added" name="message" as="p" className="at-added__message" />
        </div>
        <button type="button" className="at-added__open" data-cart-open>Ver selección</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="at-review">
        <div className="at-review__col at-review__col--summary">
          <h2 className="at-review__heading">Tu pedido</h2>
          <KitSlot kind="review" name="summary" className="at-review__summary" />
        </div>
        <div className="at-review__col">
          <h2 className="at-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="at-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="at">
    <Announce />
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="at-status" />
  </div>;
}
