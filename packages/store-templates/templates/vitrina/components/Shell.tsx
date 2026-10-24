import { useState, type ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store, copy } from './store-data';
import { IconMenu, IconShoppingBag, IconUserRound, IconX } from './icons';

const links = [
  { label: copy.shell_1, href: 'index.html#catalog', track: 'nav-catalog' },
  { label: copy.shell_2, href: 'index.html#nosotros' },
  { label: copy.shell_3, href: 'index.html#como-pedir' },
  { label: copy.shell_4, href: 'index.html#preguntas' },
  { label: copy.shell_5, href: 'index.html#contacto', track: 'contact' }
];

export function Header() {
  const [open, setOpen] = useState(false);
  return <>
    <div className="es-announce"><p>{copy.shell_6}</p></div>
    <header className="es-header">
      <div className="es-header__start">
        <button type="button" className="es-icon-btn es-menu-trigger" aria-controls="es-menu" aria-expanded={open} aria-label="Abrir menú" onClick={() => setOpen(true)}><IconMenu /></button>
        <a className="es-logo" href="index.html">{store.name}</a>
        <a className="es-contact-quick" href="index.html#contacto" data-track="contact">{copy.shell_7}</a>
      </div>
      <nav className="es-header__links" aria-label="Principal">{links.map(link => <a key={link.label} href={link.href} data-track={link.track}>{link.label}</a>)}</nav>
      <div className="es-header__end">
        <a className="es-account-link" href="acceso-registro.html" aria-label="Crear cuenta" title={copy.shell_8}><IconUserRound /></a>
        <button type="button" className="es-cart-btn" data-cart-open data-track="nav-cart" aria-label="Abrir Mi pedido"><IconShoppingBag /><span>{copy.shell_9}</span><span className="es-cart-count" data-cart-count>0</span></button>
      </div>
    </header>
    <div className={open ? 'es-menu es-menu--open' : 'es-menu'} id="es-menu" aria-hidden={!open} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <nav className="es-menu__panel" aria-label="Principal">
        <button type="button" className="es-icon-btn es-menu__close" aria-label="Cerrar menú" onClick={() => setOpen(false)}><IconX /></button>
        {links.map(link => <a key={link.label} href={link.href} data-track={link.track} onClick={() => setOpen(false)}>{link.label}</a>)}
      </nav>
    </div>
    <CartTemplate><div className="es-cart">
      <header className="es-cart__head"><h2 className="es-cart__title">{copy.shell_10}</h2><button type="button" className="es-icon-btn" data-cart-close aria-label="Cerrar Mi pedido"><IconX /></button></header>
      <KitSlot kind="cart" name="lines" className="es-cart__lines" />
      <KitSlot kind="cart" name="empty" className="es-cart__empty"><p>{copy.shell_11}</p><a href="index.html#catalog">{copy.shell_12}</a></KitSlot>
      <KitSlot kind="cart" name="suggestions" className="es-cart__suggestions" />
      <div className="es-cart__foot"><KitSlot kind="cart" name="savings" /><KitSlot kind="cart" name="total" className="es-cart__total" /><KitSlot kind="cart" name="note" /><KitSlot kind="cart" name="action" className="es-cart__action" /><KitSlot kind="cart" name="policies" /></div>
    </div></CartTemplate>
    <CartLineTemplate><div className="es-line">
      <KitSlot kind="line" name="photo" as="img" className="es-line__photo" />
      <div className="es-line__info"><KitSlot kind="line" name="name" as="p" className="es-line__name" /><KitSlot kind="line" name="option" as="p" className="es-line__meta" /><KitSlot kind="line" name="unit" as="p" className="es-line__meta" /><KitSlot kind="line" name="stock" as="p" className="es-line__meta" /><KitSlot kind="line" name="quantity" className="es-line__qty" /></div>
      <div className="es-line__end"><KitSlot kind="line" name="line-total" as="p" className="es-line__total" /><KitSlot kind="line" name="remove" as="button" className="es-line__remove">{copy.shell_13}</KitSlot></div>
    </div></CartLineTemplate>
    <AddedTemplate><div className="es-added"><KitSlot kind="added" name="photo" as="img" className="es-added__photo" /><KitSlot kind="added" name="message" as="p" className="es-added__message" /><button type="button" className="es-btn es-added__open" data-cart-open>{copy.shell_14}</button></div></AddedTemplate>
    <ReviewTemplate><div className="es-review"><div><h2>{copy.shell_15}</h2><KitSlot kind="review" name="summary" /></div><div><h2>{copy.shell_16}</h2><KitSlot kind="review" name="fields" className="es-review__fields" /></div></div></ReviewTemplate>
  </>;
}

export function Footer() {
  return <footer className="es-footer">
    <div className="es-newsletter" data-pagosya-subscribe-block>
      <div className="es-newsletter__copy"><h2>{copy.shell_17}</h2>{' '}<p>{copy.shell_18}</p></div>{' '}
      <button type="button" className="es-btn es-newsletter__button" data-pagosya-subscribe-open data-track="newsletter">{copy.shell_19}</button>
      <p className="es-newsletter__status" role="status" aria-live="polite" />
    </div>
    <div className="es-footer__grid">
    <div className="es-footer__brand"><p className="es-footer__name">{store.name}</p><p>{copy.shell_20}</p></div>
    <div><h2>{copy.shell_21}</h2><nav><a href="index.html#catalog">{copy.shell_22}</a><a href="index.html#loyalty">{copy.shell_23}</a><a href="index.html#nosotros">{copy.shell_24}</a><a href="index.html#como-pedir">{copy.shell_25}</a><a href="index.html#preguntas">{copy.shell_26}</a></nav></div>
    <div><h2>{copy.shell_27}</h2><nav data-pagosya-pages className="pagosya-info-nav" /></div>
    <div><h2>{copy.shell_28}</h2><p>{copy.shell_29}</p><button type="button" className="es-footer-cart" data-cart-open data-track="nav-cart">{copy.shell_30}</button></div>
  </div><p className="es-footer__legal">© {new Date().getFullYear()} {store.name}</p></footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="es"><a className="es-skip" href="#contenido">{copy.shell_31}</a><Header />{children}<Footer /><div data-pagosya-cart hidden /><p data-pagosya-status role="status" aria-live="polite" className="es-status" /></div>;
}
