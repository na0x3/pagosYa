import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store, copy } from './store-data';

const links = [
  { label: copy.shell_1, href: 'index.html#adornos' },
  { label: copy.shell_2, href: 'index.html#adornos' },
  { label: copy.shell_3, href: 'index.html#ambientes' },
  { label: copy.shell_4, href: 'index.html#regalos' },
];

function PersonIcon() {
  return <svg className="na-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="na-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="na-header">
    <p className="na-ticker">{copy.shell_5}</p>
    <div className="na-bar">
      <nav className="na-nav" aria-label="Principal">{links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}</nav>
      <a className="na-brand" href="index.html">{store.name}</a>
      <div className="na-tools">
        <a className="na-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
        <button type="button" className="na-tool" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="na-tool__count" data-cart-count>0</span></button>
      </div>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="na-footer">
    <div className="na-footer__top">
      <div>
        <p className="na-footer__name">{store.name}</p>
        <p className="na-footer__lead">{store.tagline || copy.shell_6}</p>
      </div>
      <nav className="na-footer__col" aria-label="Tienda">
        <p className="na-footer__heading">{copy.shell_7}</p>
        <a href="index.html#adornos">{copy.shell_8}</a>
        <a href="index.html#ambientes">{copy.shell_9}</a>
        <a href="index.html#envios">{copy.shell_10}</a>
      </nav>
      <div className="na-footer__col">
        <p className="na-footer__heading">{copy.shell_11}</p>
        <button type="button" className="na-footer__link" data-cart-open>{copy.shell_12}</button>
        <a href="checkout.html">{copy.shell_13}</a>
      </div>
    </div>
    <p className="na-footer__note">{store.city ? `${store.city} · ` : ''}{copy.shell_14}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart drawer, its lines, the "added" ribbon and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="na-cartpanel">
        <header className="na-cartpanel__head">
          <h2 className="na-cartpanel__title">{copy.shell_15}</h2>
          <button type="button" className="na-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="na-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="na-cartpanel__empty">
          <p className="na-cartpanel__empty-title">{copy.shell_16}</p>
          <p>{copy.shell_17}</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="na-cartpanel__suggestions" />
        <div className="na-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="na-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="na-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="na-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="na-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="na-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="na-line">
        <KitSlot kind="line" name="photo" as="img" className="na-line__photo" />
        <div className="na-line__info">
          <KitSlot kind="line" name="name" as="p" className="na-line__name" />
          <KitSlot kind="line" name="option" as="p" className="na-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="na-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="na-line__meta" />
          <KitSlot kind="line" name="quantity" className="na-line__qty" />
        </div>
        <div className="na-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="na-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="na-line__remove">{copy.shell_18}</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="na-added">
        <KitSlot kind="added" name="photo" as="img" className="na-added__photo" />
        <div className="na-added__copy">
          <p className="na-added__kicker">{copy.shell_19}</p>
          <KitSlot kind="added" name="message" as="p" className="na-added__message" />
        </div>
        <button type="button" className="na-added__open" data-cart-open>{copy.shell_20}</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="na-review">
        <div className="na-review__col na-review__col--summary">
          <h2 className="na-review__heading">{copy.shell_21}</h2>
          <KitSlot kind="review" name="summary" className="na-review__summary" />
        </div>
        <div className="na-review__col">
          <h2 className="na-review__heading">{copy.shell_22}</h2>
          <KitSlot kind="review" name="fields" className="na-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="na">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="na-status" />
  </div>;
}
