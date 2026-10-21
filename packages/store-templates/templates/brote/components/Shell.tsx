import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store, copy } from './store-data';

const links = [
  { label: copy.shell_1, href: 'index.html#esenciales' },
  { label: copy.shell_2, href: 'index.html#rituales' },
  { label: copy.shell_3, href: 'index.html#sin-plastico' },
  { label: copy.shell_4, href: 'index.html#recarga' },
  { label: copy.shell_5, href: 'index.html#resenas' },
];

/** The store's initials for the centred monogram: "Tu marca" → "TM". */
const initials = store.name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase() || 'B';

function PersonIcon() {
  return <svg className="br-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="br-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>;
}

export function Announce() {
  return <p className="br-announce">{copy.shell_6}</p>;
}

export function Header() {
  return <header className="br-header">
    <details className="br-menu">
      <summary className="br-menu__toggle"><span className="br-menu__bars" aria-hidden="true" /><span>{copy.shell_7}</span></summary>
      <nav className="br-menu__panel" aria-label="Principal">
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
        <a href="checkout.html">{copy.shell_8}</a>
      </nav>
    </details>
    <a className="br-mono" href="index.html" aria-label={`${store.name}, inicio`}><span aria-hidden="true">{initials}</span></a>
    <div className="br-tools">
      <a className="br-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
      <button type="button" className="br-tool" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="br-tool__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="br-footer">
    <div className="br-footer__top">
      <div className="br-footer__about">
        <p className="br-footer__mono" aria-hidden="true">{initials}</p>
        <p className="br-footer__name">{store.name}</p>
        <p className="br-footer__lead">{copy.shell_9}</p>
      </div>
      <nav className="br-footer__col" aria-label="Tienda">
        <p className="br-footer__heading">{copy.shell_10}</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="br-footer__col">
        <p className="br-footer__heading">{copy.shell_11}</p>
        <button type="button" className="br-footer__link" data-cart-open>{copy.shell_12}</button>
        <a href="checkout.html">{copy.shell_13}</a>
        <p>{store.city ? `Desde ${store.city} con cariño` : copy.shell_14}</p>
      </div>
    </div>
    <p className="br-footer__note">{store.name}{copy.shell_15}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart drawer, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="br-cartpanel">
        <header className="br-cartpanel__head">
          <h2 className="br-cartpanel__title">{copy.shell_16}</h2>
          <button type="button" className="br-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="br-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="br-cartpanel__empty">
          <p className="br-cartpanel__empty-title">{copy.shell_17}</p>
          <p>{copy.shell_18}</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="br-cartpanel__suggestions" />
        <div className="br-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="br-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="br-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="br-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="br-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="br-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="br-line">
        <KitSlot kind="line" name="photo" as="img" className="br-line__photo" />
        <div className="br-line__info">
          <KitSlot kind="line" name="name" as="p" className="br-line__name" />
          <KitSlot kind="line" name="option" as="p" className="br-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="br-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="br-line__meta" />
          <KitSlot kind="line" name="quantity" className="br-line__qty" />
        </div>
        <div className="br-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="br-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="br-line__remove">{copy.shell_19}</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="br-added">
        <KitSlot kind="added" name="photo" as="img" className="br-added__photo" />
        <div className="br-added__copy">
          <p className="br-added__kicker">{copy.shell_20}</p>
          <KitSlot kind="added" name="message" as="p" className="br-added__message" />
        </div>
        <button type="button" className="br-added__open" data-cart-open>{copy.shell_21}</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="br-review">
        <div className="br-review__col br-review__col--summary">
          <h2 className="br-review__heading">{copy.shell_22}</h2>
          <KitSlot kind="review" name="summary" className="br-review__summary" />
        </div>
        <div className="br-review__col">
          <h2 className="br-review__heading">{copy.shell_23}</h2>
          <KitSlot kind="review" name="fields" className="br-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="br">
    <Announce />
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="br-status" />
  </div>;
}
