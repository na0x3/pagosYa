import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store, copy } from './store-data';

const links = [
  { label: copy.shell_1, href: 'index.html#mas-vendidos' },
  { label: copy.shell_2, href: 'index.html#comparar' },
  { label: copy.shell_3, href: 'index.html#categorias' },
  { label: copy.shell_4, href: 'index.html#categorias' },
  { label: copy.shell_5, href: 'index.html#escritorio' },
];

function CloseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;
}

export function Announce() {
  return <p className="ec-announce">{copy.shell_6}</p>;
}

/** The black rounded bar, inset 12px: store name left, nav centred, the "Carrito (0)" pill right. On a phone the nav becomes a swipeable row. */
export function Header() {
  return <header className="ec-header">
    <a className="ec-logo" href="index.html">{store.name}</a>
    <nav className="ec-nav" aria-label="Principal">{links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ec-cart" data-cart-open>{copy.shell_7}<span className="ec-cart__count">(<span data-cart-count>0</span>)</span></button>
  </header>;
}

export function Footer() {
  return <footer className="ec-footer">
    <div className="ec-footer__top">
      <div className="ec-footer__about">
        <p className="ec-footer__name">{store.name}</p>
        <p className="ec-footer__lead">{copy.shell_8}</p>
      </div>
      <nav className="ec-footer__col" aria-label="Pie de página">
        <p className="ec-footer__heading">{copy.shell_9}</p>
        {links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="ec-footer__col">
        <p className="ec-footer__heading">{copy.shell_10}</p>
        <a href="index.html#soporte">{copy.shell_11}</a>
        <a href="index.html#preguntas">{copy.shell_12}</a>
        <button type="button" className="ec-footer__link" data-cart-open>{copy.shell_13}</button>
        <a href="checkout.html">{copy.shell_14}</a>
      </div>
    </div>
    <p className="ec-footer__note"><span>{store.city ? `Enviamos desde ${store.city} a toda Bolivia` : copy.shell_15}</span><span>{copy.shell_16}</span></p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The centred white cart card, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="ec-cartpanel">
        <header className="ec-cartpanel__head">
          <h2 className="ec-cartpanel__title">{copy.shell_17}</h2>
          <button type="button" className="ec-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><CloseIcon /></button>
        </header>
        <KitSlot kind="cart" name="lines" className="ec-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="ec-cartpanel__empty">
          <p className="ec-cartpanel__empty-title">{copy.shell_18}</p>
          <p>{copy.shell_19}</p>
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
          <KitSlot kind="line" name="remove" as="button" className="ec-line__remove">{copy.shell_20}</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="ec-added">
        <KitSlot kind="added" name="photo" as="img" className="ec-added__photo" />
        <div className="ec-added__copy">
          <p className="ec-added__kicker"><span className="ec-added__dot" aria-hidden="true" />{copy.shell_21}</p>
          <KitSlot kind="added" name="message" as="p" className="ec-added__message" />
        </div>
        <button type="button" className="ec-added__open" data-cart-open>{copy.shell_22}</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="ec-review">
        <div className="ec-review__col ec-review__col--summary">
          <h2 className="ec-review__heading">{copy.shell_23}</h2>
          <KitSlot kind="review" name="summary" className="ec-review__summary" />
        </div>
        <div className="ec-review__col">
          <h2 className="ec-review__heading">{copy.shell_24}</h2>
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
