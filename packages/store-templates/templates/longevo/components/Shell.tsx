import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store, copy } from './store-data';

const links = [
  { label: copy.shell_1, href: 'index.html' },
  { label: copy.shell_2, href: 'index.html#blog' },
  { label: copy.shell_3, href: 'index.html#productos' },
];

function BagIcon() {
  return <svg className="lg-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="lg-header">
    <div className="lg-pill">
      <a className="lg-brand" href="index.html">{store.name}</a>
      <nav className="lg-nav" aria-label="Principal">{links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}</nav>
      <a className="lg-sub" href="index.html#boletin">{copy.shell_4}</a>
      <button type="button" className="lg-cart" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="lg-cart__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="lg-footer">
    <div className="lg-footer__top">
      <div>
        <p className="lg-footer__name">{store.name}</p>
        <p className="lg-footer__lead">{store.tagline || copy.shell_5}</p>
      </div>
      <nav className="lg-footer__col" aria-label="Tienda">
        <p className="lg-footer__heading">{copy.shell_6}</p>
        {links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="lg-footer__col">
        <p className="lg-footer__heading">{copy.shell_7}</p>
        <button type="button" className="lg-footer__link" data-cart-open>{copy.shell_8}</button>
        <a href="checkout.html">{copy.shell_9}</a>
      </div>
    </div>
    <p className="lg-footer__note">{copy.shell_10}{store.city ? `${store.city} · ` : ''}{copy.shell_11}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart drawer, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="lg-cartpanel">
        <header className="lg-cartpanel__head">
          <h2 className="lg-cartpanel__title">{copy.shell_12}</h2>
          <button type="button" className="lg-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="lg-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="lg-cartpanel__empty">
          <p className="lg-cartpanel__empty-title">{copy.shell_13}</p>
          <p>{copy.shell_14}</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="lg-cartpanel__suggestions" />
        <div className="lg-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="lg-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="lg-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="lg-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="lg-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="lg-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="lg-line">
        <KitSlot kind="line" name="photo" as="img" className="lg-line__photo" />
        <div className="lg-line__info">
          <KitSlot kind="line" name="name" as="p" className="lg-line__name" />
          <KitSlot kind="line" name="option" as="p" className="lg-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="lg-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="lg-line__meta" />
          <KitSlot kind="line" name="quantity" className="lg-line__qty" />
        </div>
        <div className="lg-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="lg-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="lg-line__remove">{copy.shell_15}</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="lg-added">
        <KitSlot kind="added" name="photo" as="img" className="lg-added__photo" />
        <div className="lg-added__copy">
          <p className="lg-added__kicker">{copy.shell_16}</p>
          <KitSlot kind="added" name="message" as="p" className="lg-added__message" />
        </div>
        <button type="button" className="lg-added__open" data-cart-open>{copy.shell_17}</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="lg-review">
        <div className="lg-review__col lg-review__col--summary">
          <h2 className="lg-review__heading">{copy.shell_18}</h2>
          <KitSlot kind="review" name="summary" className="lg-review__summary" />
        </div>
        <div className="lg-review__col">
          <h2 className="lg-review__heading">{copy.shell_19}</h2>
          <KitSlot kind="review" name="fields" className="lg-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="lg">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="lg-status" />
  </div>;
}
