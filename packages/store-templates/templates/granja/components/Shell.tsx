import type { CSSProperties, ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

const links = [
  { label: 'Canasta', href: 'index.html#canasta' },
  { label: 'Cómo criamos', href: 'index.html#como-criamos' },
  { label: 'Reparto', href: 'index.html#reparto' },
  { label: 'Visítanos', href: 'index.html#visita' },
];

const footerLinks = [...links, { label: 'Preguntas', href: 'index.html#preguntas' }];

/** The longest word's length sizes the footer name so that word fits one line (see .gr-footer__name). */
const nameFit = { '--gr-fit': Math.max(5, ...store.name.split(/\s+/).map(word => Array.from(word).length)) } as CSSProperties;

function BasketIcon() {
  return <svg className="gr-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><path d="M3 10h18l-2 10H5L3 10Z" /><path d="M7.5 10 11 4M16.5 10 13 4" /><path d="M9 14v3M15 14v3" /></svg>;
}

/** Transparent over the home hero, cream everywhere else and once the hero has scrolled away (CSS only). */
export function Header() {
  return <header className="gr-header">
    <a className="gr-logo" href="index.html">{store.name}</a>
    <nav className="gr-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="gr-tools">
      <details className="gr-menu">
        <summary className="gr-menu__toggle"><span className="gr-menu__bars" aria-hidden="true" /><span>Menú</span></summary>
        <nav className="gr-menu__panel" aria-label="Principal en el teléfono">
          {footerLinks.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
          <a href="checkout.html">Mi pedido</a>
        </nav>
      </details>
      <button type="button" className="gr-cart" data-cart-open aria-label="Abrir canasta"><BasketIcon /><span className="gr-cart__label">Canasta</span><span className="gr-cart__count" data-cart-count>0</span></button>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="gr-footer">
    <div className="gr-footer__top">
      <div className="gr-footer__about">
        <p className="gr-footer__name" style={nameFit}>{store.name}</p>
        <p className="gr-footer__lead">Huevos de gallinas libres, queso fresco y miel del campo, recogidos la víspera de cada reparto.</p>
      </div>
      <nav className="gr-footer__col" aria-label="Pie de página">
        <p className="gr-footer__heading">La granja</p>
        {footerLinks.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="gr-footer__col">
        <p className="gr-footer__heading">Reparto</p>
        <p>Martes y viernes</p>
        <p>Cercado, Sacaba y Quillacollo</p>
        <button type="button" className="gr-footer__link" data-cart-open>Ver mi canasta</button>
        <a href="checkout.html">Mi pedido</a>
      </div>
    </div>
    <p className="gr-footer__note">{store.city ? `${store.city} · ` : ''}Pagos seguros con QR y tarjeta</p>
  </footer>;
}

/** The bottom-sheet cart, its lines, the "added" ribbon and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="gr-cartpanel">
        <span className="gr-cartpanel__grip" aria-hidden="true" />
        <header className="gr-cartpanel__head">
          <h2 className="gr-cartpanel__title">Tu canasta</h2>
          <button type="button" className="gr-cartpanel__close" data-cart-close>Cerrar</button>
        </header>
        <KitSlot kind="cart" name="lines" className="gr-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="gr-cartpanel__empty">
          <p className="gr-cartpanel__empty-title">La canasta está vacía</p>
          <p>Empieza por una docena de huevos: los recogemos la víspera del reparto.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="gr-cartpanel__suggestions" />
        <div className="gr-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="gr-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="gr-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="gr-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="gr-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="gr-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="gr-line">
        <KitSlot kind="line" name="photo" as="img" className="gr-line__photo" />
        <div className="gr-line__info">
          <KitSlot kind="line" name="name" as="p" className="gr-line__name" />
          <KitSlot kind="line" name="option" as="p" className="gr-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="gr-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="gr-line__meta" />
          <KitSlot kind="line" name="quantity" className="gr-line__qty" />
        </div>
        <div className="gr-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="gr-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="gr-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="gr-added">
        <KitSlot kind="added" name="photo" as="img" className="gr-added__photo" />
        <KitSlot kind="added" name="message" as="p" className="gr-added__message" />
        <button type="button" className="gr-added__open" data-cart-open>Ver canasta</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="gr-review">
        <div className="gr-review__col gr-review__col--summary">
          <h2 className="gr-review__heading">Tu canasta</h2>
          <KitSlot kind="review" name="summary" className="gr-review__summary" />
        </div>
        <div className="gr-review__col">
          <h2 className="gr-review__heading">Entrega y pago</h2>
          <KitSlot kind="review" name="fields" className="gr-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="gr">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="gr-status" />
  </div>;
}
