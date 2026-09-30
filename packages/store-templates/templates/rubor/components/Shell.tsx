import type { CSSProperties, ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

/**
 * How many characters the giant wordmark must fit across its column (see .ru-hero__name / .ru-footer__brand).
 * A short name of several words ("tu marca.") is sized to run the full width on one line; if it runs a little
 * long it wraps at a space. Otherwise the name is sized by its longest word, plus one letter of slack for wide
 * letters, so every word fits whole and the name wraps between words instead of mid-word.
 */
export function wordmarkFit(name: string): CSSProperties {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const whole = Array.from(words.join(' ')).length + 1;
  const longest = Math.max(...words.map((word, index) => Array.from(word).length + (index === words.length - 1 ? 1 : 0)), 1) + 1;
  return { '--ru-fit': Math.max(6, words.length > 1 && whole <= 14 ? whole : longest) } as CSSProperties;
}

const nameFit = wordmarkFit(store.name);

const links = [
  { label: 'Limpiar', href: 'index.html#rutina' },
  { label: 'Hidratar', href: 'index.html#ingredientes' },
  { label: 'Proteger', href: 'index.html#antes-despues' },
  { label: 'Novedades', href: 'index.html#mas-queridos' },
];

function BagIcon() {
  return <svg className="ru-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 12.5H6.2L5 8Z" /><path d="M9 8V6.8a3 3 0 0 1 6 0V8" /></svg>;
}

/** The store name as a lowercase wordmark with its period. */
export function Wordmark({ className }: { className: string }) {
  return <span className={className}>{store.name}<span className="ru-dot">.</span></span>;
}

export function Announce() {
  return <p className="ru-announce">Envío gratis desde Bs 250</p>;
}

export function Header() {
  return <header className="ru-header">
    <a className="ru-logo" href="index.html" aria-label={`${store.name}, inicio`}><Wordmark className="ru-logo__name" /></a>
    <nav className="ru-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ru-cart" data-cart-open aria-label="Abrir carrito"><BagIcon /><span className="ru-cart__label">Carrito</span><span className="ru-cart__count" data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="ru-footer">
    <div className="ru-footer__top">
      <div className="ru-footer__about">
        <p className="ru-footer__brand" style={nameFit}><Wordmark className="ru-footer__name" /></p>
        <p className="ru-footer__lead">Rutinas cortas, fórmulas honestas y una piel que se siente tuya.</p>
      </div>
      <nav className="ru-footer__col" aria-label="Pie de página">
        <p className="ru-footer__heading">Tienda</p>
        {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="ru-footer__col">
        <p className="ru-footer__heading">Tu pedido</p>
        <button type="button" className="ru-footer__link" data-cart-open>Ver carrito</button>
        <a href="checkout.html">Mi pedido</a>
        <p>{store.city ? `Enviamos desde ${store.city}` : 'Envíos a toda Bolivia'}</p>
      </div>
    </div>
    <p className="ru-footer__note">{store.name} · Pagos seguros con QR y tarjeta</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

/** The cream cart drawer, its lines, the "added" toast and the checkout review: markup owned here, filled by the kit. */
export function Commerce() {
  return <>
    <CartTemplate>
      <div className="ru-cartpanel">
        <header className="ru-cartpanel__head">
          <h2 className="ru-cartpanel__title">tu carrito<span className="ru-dot">.</span></h2>
          <button type="button" className="ru-cartpanel__close" data-cart-close>Cerrar</button>
        </header>
        <KitSlot kind="cart" name="lines" className="ru-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="ru-cartpanel__empty">
          <p className="ru-cartpanel__empty-title">todavía nada por aquí<span className="ru-dot">.</span></p>
          <p>Empieza por lo básico: limpiar, hidratar y proteger.</p>
        </KitSlot>
        <KitSlot kind="cart" name="suggestions" className="ru-cartpanel__suggestions" />
        <div className="ru-cartpanel__foot">
          <KitSlot kind="cart" name="savings" className="ru-cartpanel__savings" />
          <KitSlot kind="cart" name="total" className="ru-cartpanel__total" />
          <KitSlot kind="cart" name="note" className="ru-cartpanel__note" />
          <KitSlot kind="cart" name="action" className="ru-cartpanel__action" />
          <KitSlot kind="cart" name="policies" className="ru-cartpanel__policies" />
        </div>
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="ru-line">
        <KitSlot kind="line" name="photo" as="img" className="ru-line__photo" />
        <div className="ru-line__info">
          <KitSlot kind="line" name="name" as="p" className="ru-line__name" />
          <KitSlot kind="line" name="option" as="p" className="ru-line__meta" />
          <KitSlot kind="line" name="unit" as="p" className="ru-line__meta" />
          <KitSlot kind="line" name="stock" as="p" className="ru-line__meta" />
          <KitSlot kind="line" name="quantity" className="ru-line__qty" />
        </div>
        <div className="ru-line__end">
          <KitSlot kind="line" name="line-total" as="p" className="ru-line__total" />
          <KitSlot kind="line" name="remove" as="button" className="ru-line__remove">Quitar</KitSlot>
        </div>
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="ru-added">
        <KitSlot kind="added" name="photo" as="img" className="ru-added__photo" />
        <div className="ru-added__copy">
          <p className="ru-added__kicker">¡a tu rutina!</p>
          <KitSlot kind="added" name="message" as="p" className="ru-added__message" />
        </div>
        <button type="button" className="ru-added__open" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="ru-review">
        <div className="ru-review__col ru-review__col--summary">
          <h2 className="ru-review__heading">tu rutina<span className="ru-dot">.</span></h2>
          <KitSlot kind="review" name="summary" className="ru-review__summary" />
        </div>
        <div className="ru-review__col">
          <h2 className="ru-review__heading">entrega y pago<span className="ru-dot">.</span></h2>
          <KitSlot kind="review" name="fields" className="ru-review__fields" />
        </div>
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ru">
    <Announce />
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ru-status" />
  </div>;
}
