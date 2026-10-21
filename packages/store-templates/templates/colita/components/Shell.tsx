import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store, copy } from './store-data';

const links = [
  { label: copy.shell_1, href: 'index.html#favoritos' },
  { label: copy.shell_2, href: 'index.html#por-mascota' },
  { label: copy.shell_3, href: 'index.html#nutricion' },
  { label: copy.shell_4, href: 'index.html#club' },
];

function PersonIcon() {
  return <svg className="co-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4.2 4.2-6.5 8-6.5s6.8 2.3 8 6.5" /></svg>;
}

function BagIcon() {
  return <svg className="co-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h16l-1.2 12.5H5.2L4 8Z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /></svg>;
}

/** A paw print, drawn for this template. */
export function Paw({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="42" rx="14" ry="12" fill="currentColor" />
    <ellipse cx="14" cy="28" rx="6" ry="8" transform="rotate(-18 14 28)" fill="currentColor" />
    <ellipse cx="25" cy="16" rx="6" ry="8.5" transform="rotate(-6 25 16)" fill="currentColor" />
    <ellipse cx="39" cy="16" rx="6" ry="8.5" transform="rotate(6 39 16)" fill="currentColor" />
    <ellipse cx="50" cy="28" rx="6" ry="8" transform="rotate(18 50 28)" fill="currentColor" />
  </svg>;
}

/** The floating yellow bar: store name left, nav centred, account and cart right; a round menu button on a phone. */
export function Header() {
  return <header className="co-header">
    <a className="co-logo" href="index.html">{store.name}</a>
    <nav className="co-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="co-tools">
      <a className="co-tool" href="checkout.html" aria-label="Mi pedido"><PersonIcon /></a>
      <button type="button" className="co-cart" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="co-cart__label">{copy.shell_5}</span><span className="co-cart__count" data-cart-count>0</span></button>
      <details className="co-menu">
        <summary className="co-menu__toggle" aria-label="Menú"><span className="co-menu__bars" aria-hidden="true" /></summary>
        <nav className="co-menu__panel" aria-label="Principal en el teléfono">
          {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
          <a href="index.html#resenas">{copy.shell_6}</a>
          <a href="checkout.html">{copy.shell_7}</a>
        </nav>
      </details>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="co-footer">
    <div className="co-footer__top">
      <div className="co-footer__about">
        <p className="co-footer__name">{store.name}<Paw className="co-footer__paw" /></p>
        <p className="co-footer__lead">{copy.shell_8}</p>
      </div>
      <nav className="co-footer__col" aria-label="Pie de página">
        <p className="co-footer__heading">{copy.shell_9}</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
        <a href="index.html#resenas">{copy.shell_10}</a>
      </nav>
      <div className="co-footer__col">
        <p className="co-footer__heading">{copy.shell_11}</p>
        <button type="button" className="co-footer__link" data-cart-open>{copy.shell_12}</button>
        <a href="checkout.html">{copy.shell_13}</a>
        <p>{store.city ? `Enviamos desde ${store.city}` : copy.shell_14}</p>
      </div>
    </div>
    <p className="co-footer__note">{store.name}{copy.shell_15}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cream bottom sheet, its lines, the "added" bubble and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="co-cartpanel">
        <header className="co-cartpanel__head">
          <h2 className="co-cartpanel__title"><Paw className="co-cartpanel__paw" />{copy.shell_16}</h2>
          <button type="button" className="co-cartpanel__close" data-cart-close aria-label="Cerrar carrito"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        </header>
        <KitSlot kind="cart" name="lines" className="co-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="co-cartpanel__empty">
          <p className="co-cartpanel__empty-title">{copy.shell_17}</p>
          <p>{copy.shell_18}</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="co-cartpanel__suggestions" />
        <div className="co-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="co-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="co-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="co-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="co-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="co-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="co-line">
        <KitSlot kind="line" name="photo" as="img" className="co-line__photo" />
        <div className="co-line__info">
          <KitSlot kind="line" name="name" as="p" className="co-line__name" />
          <KitSlot kind="line" name="option" as="p" className="co-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="co-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="co-line__meta" />
          <KitSlot kind="line" name="quantity" className="co-line__qty" />
        </div>
        <div className="co-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="co-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="co-line__remove">{copy.shell_19}</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="co-added">
        <KitSlot kind="added" name="photo" as="img" className="co-added__photo" />
        <div className="co-added__copy">
          <p className="co-added__kicker">{copy.shell_20}</p>
          <KitSlot kind="added" name="message" as="p" className="co-added__message" />
        </div>
        <button type="button" className="co-added__open" data-cart-open>{copy.shell_21}</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="co-review">
        <div className="co-review__col co-review__col--summary">
          <h2 className="co-review__heading">{copy.shell_22}</h2>
          <KitSlot kind="review" name="summary" className="co-review__summary" />
        </div>
        <div className="co-review__col">
          <h2 className="co-review__heading">{copy.shell_23}</h2>
          <KitSlot kind="review" name="fields" className="co-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="co">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="co-status" />
  </div>;
}
