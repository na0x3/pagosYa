import type { ReactNode } from 'react';
import { store, copy } from './store-data';

const links = [{ label: copy.shell_1, href: 'index.html#novedades' }, { label: copy.shell_2, href: 'index.html#coleccion' }, { label: copy.shell_3, href: 'index.html#preguntas' }];

export function Header() {
  return <header className="en-header">
    <a className="en-logo" href="index.html">{store.name}</a>
    <nav className="en-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="en-cart" data-cart-open>{copy.shell_4}<span className="en-cart__count" data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="en-footer">
    <p className="en-ornament" aria-hidden="true">✿</p>
    <p className="en-footer__name">{store.name}</p>
    <p>{store.tagline || copy.shell_5}</p>
    <nav className="en-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">{copy.shell_6}</a></nav>
    <p className="en-footer__note">{store.city ? `${store.city} · ` : ''}{copy.shell_7}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="en">
    <p className="en-announce">{copy.shell_8}</p>
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="en-status" />
  </div>;
}
