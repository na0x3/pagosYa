import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store, copy } from './store-data';

const links = [
  { label: copy.shell_1, href: 'index.html#drop' },
  { label: copy.shell_2, href: 'index.html#looks' },
  { label: copy.shell_3, href: 'index.html#codigo' },
  { label: copy.shell_4, href: 'index.html#comunidad' },
];

const ticker = [copy.shell_5, copy.shell_6, copy.shell_7, copy.shell_8];

function BagIcon() {
  return <svg className="ba-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

export function Announce() {
  return <div className="ba-ticker" aria-label="Novedades de la tienda">
    <div className="ba-ticker__track" aria-hidden="false">
      {[0, 1].map(copy => <p key={copy} className="ba-ticker__row">{ticker.map(item => <span key={item}>{item}<i aria-hidden="true">/</i></span>)}</p>)}
    </div>
  </div>;
}

export function Header() {
  return <header className="ba-header">
    <a className="ba-brand" href="index.html">[{store.name}]</a>
    <nav className="ba-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="ba-tools">
      <a className="ba-account" href="checkout.html">{copy.shell_9}</a>
      <button type="button" className="ba-cart" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="ba-cart__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="ba-footer">
    <p className="ba-footer__mark" aria-hidden="true">[{store.name}]</p>
    <div className="ba-footer__row">
      <p className="ba-footer__lead">{store.tagline || copy.shell_10}</p>
      <nav className="ba-footer__links" aria-label="Pie de página">
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
        <a href="checkout.html">{copy.shell_11}</a>
        <button type="button" className="ba-footer__link" data-cart-open>{copy.shell_12}</button>
      </nav>
    </div>
    <p className="ba-footer__note">{store.city ? `${store.city} · ` : ''}{copy.shell_13}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cart drawer, its lines, the "added" ribbon and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="ba-cartpanel">
        <header className="ba-cartpanel__head">
          <h2 className="ba-cartpanel__title">{copy.shell_14}</h2>
          <button type="button" className="ba-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="ba-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="ba-cartpanel__empty">
          <p className="ba-cartpanel__empty-title">{copy.shell_15}</p>
          <p>{copy.shell_16}</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="ba-cartpanel__suggestions" />
        <div className="ba-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="ba-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="ba-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="ba-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="ba-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="ba-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="ba-line">
        <KitSlot kind="line" name="photo" as="img" className="ba-line__photo" />
        <div className="ba-line__info">
          <KitSlot kind="line" name="name" as="p" className="ba-line__name" />
          <KitSlot kind="line" name="option" as="p" className="ba-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="ba-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="ba-line__meta" />
          <KitSlot kind="line" name="quantity" className="ba-line__qty" />
        </div>
        <div className="ba-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="ba-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="ba-line__remove">{copy.shell_17}</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="ba-added">
        <KitSlot kind="added" name="photo" as="img" className="ba-added__photo" />
        <div className="ba-added__copy">
          <p className="ba-added__kicker">{copy.shell_18}</p>
          <KitSlot kind="added" name="message" as="p" className="ba-added__message" />
        </div>
        <button type="button" className="ba-added__open" data-cart-open>{copy.shell_19}</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="ba-review">
        <div className="ba-review__col ba-review__col--summary">
          <h2 className="ba-review__heading">{copy.shell_20}</h2>
          <KitSlot kind="review" name="summary" className="ba-review__summary" />
        </div>
        <div className="ba-review__col">
          <h2 className="ba-review__heading">{copy.shell_21}</h2>
          <KitSlot kind="review" name="fields" className="ba-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ba">
    <Announce />
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ba-status" />
  </div>;
}
