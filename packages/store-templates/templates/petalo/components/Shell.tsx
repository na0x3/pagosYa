import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store, copy } from './store-data';

const links = [
  { label: copy.shell_1, href: 'index.html' },
  { label: copy.shell_2, href: 'index.html#productos' },
  { label: copy.shell_3, href: 'index.html#boletin' },
];

function PersonIcon() {
  return <svg className="pe-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="pe-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="pe-header">
    <nav className="pe-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <a className="pe-brand" href="index.html">{store.name}</a>
    <div className="pe-tools">
      <a className="pe-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
      <button type="button" className="pe-tool" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="pe-tool__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="pe-footer">
    <div className="pe-footer__top">
      <div className="pe-footer__about">
        <p className="pe-footer__name">{store.name}</p>
        <p className="pe-footer__lead">{store.tagline || copy.shell_4}</p>
      </div>
      <nav className="pe-footer__col" aria-label="Tienda">
        <p className="pe-footer__heading">{copy.shell_5}</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="pe-footer__col">
        <p className="pe-footer__heading">{copy.shell_6}</p>
        <button type="button" className="pe-footer__link" data-cart-open>{copy.shell_7}</button>
        <a href="checkout.html">{copy.shell_8}</a>
        <p>{store.city ? `Desde ${store.city}` : copy.shell_9}</p>
      </div>
    </div>
    <p className="pe-footer__note">{copy.shell_10}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart drawer, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="pe-cartpanel">
        <header className="pe-cartpanel__head">
          <h2 className="pe-cartpanel__title">{copy.shell_11}</h2>
          <button type="button" className="pe-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="pe-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="pe-cartpanel__empty">
          <p className="pe-cartpanel__empty-title">{copy.shell_12}</p>
          <p>{copy.shell_13}</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="pe-cartpanel__suggestions" />
        <div className="pe-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="pe-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="pe-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="pe-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="pe-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="pe-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="pe-line">
        <KitSlot kind="line" name="photo" as="img" className="pe-line__photo" />
        <div className="pe-line__info">
          <KitSlot kind="line" name="name" as="p" className="pe-line__name" />
          <KitSlot kind="line" name="option" as="p" className="pe-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="pe-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="pe-line__meta" />
          <KitSlot kind="line" name="quantity" className="pe-line__qty" />
        </div>
        <div className="pe-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="pe-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="pe-line__remove">{copy.shell_14}</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="pe-added">
        <KitSlot kind="added" name="photo" as="img" className="pe-added__photo" />
        <div className="pe-added__copy">
          <p className="pe-added__kicker">{copy.shell_15}</p>
          <KitSlot kind="added" name="message" as="p" className="pe-added__message" />
        </div>
        <button type="button" className="pe-added__open" data-cart-open>{copy.shell_16}</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="pe-review">
        <div className="pe-review__col pe-review__col--summary">
          <h2 className="pe-review__heading">{copy.shell_17}</h2>
          <KitSlot kind="review" name="summary" className="pe-review__summary" />
        </div>
        <div className="pe-review__col">
          <h2 className="pe-review__heading">{copy.shell_18}</h2>
          <KitSlot kind="review" name="fields" className="pe-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="pe">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="pe-status" />
  </div>;
}
