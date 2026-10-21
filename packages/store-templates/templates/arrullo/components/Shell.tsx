import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store, copy } from './store-data';

const links = [
  { label: copy.shell_1, href: 'index.html#regalos' },
  { label: copy.shell_2, href: 'index.html#filosofia' },
  { label: copy.shell_3, href: 'index.html#guia' },
];

function PersonIcon() {
  return <svg className="au-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="au-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="au-header">
    <p className="au-ticker">{copy.shell_4}</p>
    <div className="au-bar">
      <a className="au-brand" href="index.html"><span className="au-brand__dot" aria-hidden="true" />{store.name}</a>
      <nav className="au-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
      <div className="au-tools">
        <a className="au-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
        <button type="button" className="au-tool" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="au-tool__count" data-cart-count>0</span></button>
      </div>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="au-footer">
    <div className="au-footer__top">
      <div>
        <p className="au-footer__name">{store.name}</p>
        <p className="au-footer__lead">{store.tagline || copy.shell_5}</p>
      </div>
      <nav className="au-footer__col" aria-label="Tienda">
        <p className="au-footer__heading">{copy.shell_6}</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="au-footer__col">
        <p className="au-footer__heading">{copy.shell_7}</p>
        <button type="button" className="au-footer__link" data-cart-open>{copy.shell_8}</button>
        <a href="checkout.html">{copy.shell_9}</a>
      </div>
    </div>
    <p className="au-footer__note">{store.city ? `${store.city} · ` : ''}{copy.shell_10}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart drawer, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="au-cartpanel">
        <header className="au-cartpanel__head">
          <h2 className="au-cartpanel__title">{copy.shell_11}</h2>
          <button type="button" className="au-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="au-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="au-cartpanel__empty">
          <p className="au-cartpanel__empty-title">{copy.shell_12}</p>
          <p>{copy.shell_13}</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="au-cartpanel__suggestions" />
        <div className="au-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="au-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="au-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="au-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="au-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="au-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="au-line">
        <KitSlot kind="line" name="photo" as="img" className="au-line__photo" />
        <div className="au-line__info">
          <KitSlot kind="line" name="name" as="p" className="au-line__name" />
          <KitSlot kind="line" name="option" as="p" className="au-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="au-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="au-line__meta" />
          <KitSlot kind="line" name="quantity" className="au-line__qty" />
        </div>
        <div className="au-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="au-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="au-line__remove">{copy.shell_14}</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="au-added">
        <KitSlot kind="added" name="photo" as="img" className="au-added__photo" />
        <div className="au-added__copy">
          <p className="au-added__kicker">{copy.shell_15}</p>
          <KitSlot kind="added" name="message" as="p" className="au-added__message" />
        </div>
        <button type="button" className="au-added__open" data-cart-open>{copy.shell_16}</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="au-review">
        <div className="au-review__col au-review__col--summary">
          <h2 className="au-review__heading">{copy.shell_17}</h2>
          <KitSlot kind="review" name="summary" className="au-review__summary" />
        </div>
        <div className="au-review__col">
          <h2 className="au-review__heading">{copy.shell_18}</h2>
          <KitSlot kind="review" name="fields" className="au-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="au">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="au-status" />
  </div>;
}
