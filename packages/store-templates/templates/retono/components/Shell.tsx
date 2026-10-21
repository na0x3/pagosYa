import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store, copy } from './store-data';

const links = [
  { label: copy.shell_1, href: 'index.html#algodon' },
  { label: copy.shell_2, href: 'index.html#ropa' },
  { label: copy.shell_3, href: 'index.html#edades' },
  { label: copy.shell_4, href: 'index.html#edades' },
  { label: copy.shell_5, href: 'index.html#edades' },
];

function PersonIcon() {
  return <svg className="rt-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="rt-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Header() {
  return <header className="rt-header">
    <p className="rt-ticker">{copy.shell_6}</p>
    <div className="rt-bar">
      <a className="rt-brand" href="index.html">{store.name}</a>
      <nav className="rt-nav" aria-label="Principal">{links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}</nav>
      <div className="rt-tools">
        <a className="rt-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
        <button type="button" className="rt-tool" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="rt-tool__count" data-cart-count>0</span></button>
      </div>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="rt-footer">
    <div className="rt-footer__top">
      <div>
        <p className="rt-footer__name">{store.name}</p>
        <p className="rt-footer__lead">{store.tagline || copy.shell_7}</p>
      </div>
      <nav className="rt-footer__col" aria-label="Tienda">
        <p className="rt-footer__heading">{copy.shell_8}</p>
        <a href="index.html#ropa">{copy.shell_9}</a>
        <a href="index.html#edades">{copy.shell_10}</a>
        <a href="index.html#looks">{copy.shell_11}</a>
      </nav>
      <div className="rt-footer__col">
        <p className="rt-footer__heading">{copy.shell_12}</p>
        <button type="button" className="rt-footer__link" data-cart-open>{copy.shell_13}</button>
        <a href="checkout.html">{copy.shell_14}</a>
      </div>
    </div>
    <p className="rt-footer__note">{store.city ? `${store.city} · ` : ''}{copy.shell_15}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart drawer, its lines, the "added" bubble and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="rt-cartpanel">
        <header className="rt-cartpanel__head">
          <h2 className="rt-cartpanel__title">{copy.shell_16}</h2>
          <button type="button" className="rt-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="rt-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="rt-cartpanel__empty">
          <p className="rt-cartpanel__empty-title">{copy.shell_17}</p>
          <p>{copy.shell_18}</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="rt-cartpanel__suggestions" />
        <div className="rt-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="rt-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="rt-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="rt-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="rt-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="rt-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="rt-line">
        <KitSlot kind="line" name="photo" as="img" className="rt-line__photo" />
        <div className="rt-line__info">
          <KitSlot kind="line" name="name" as="p" className="rt-line__name" />
          <KitSlot kind="line" name="option" as="p" className="rt-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="rt-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="rt-line__meta" />
          <KitSlot kind="line" name="quantity" className="rt-line__qty" />
        </div>
        <div className="rt-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="rt-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="rt-line__remove">{copy.shell_19}</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="rt-added">
        <KitSlot kind="added" name="photo" as="img" className="rt-added__photo" />
        <div className="rt-added__copy">
          <p className="rt-added__kicker">{copy.shell_20}</p>
          <KitSlot kind="added" name="message" as="p" className="rt-added__message" />
        </div>
        <button type="button" className="rt-added__open" data-cart-open>{copy.shell_21}</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="rt-review">
        <div className="rt-review__col rt-review__col--summary">
          <h2 className="rt-review__heading">{copy.shell_22}</h2>
          <KitSlot kind="review" name="summary" className="rt-review__summary" />
        </div>
        <div className="rt-review__col">
          <h2 className="rt-review__heading">{copy.shell_23}</h2>
          <KitSlot kind="review" name="fields" className="rt-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="rt">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="rt-status" />
  </div>;
}
