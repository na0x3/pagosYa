import type { ReactNode } from 'react';
import { store, copy } from './store-data';

const links = [{ label: copy.shell_1, href: 'index.html#tienda' }, { label: copy.shell_2, href: 'index.html#rutina' }, { label: copy.shell_3, href: 'index.html#preguntas' }];

export function Header() {
  return <header className="au-header">
    <nav className="au-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <a className="au-logo" href="index.html">{store.name}</a>
    <button type="button" className="au-cart" data-cart-open>{copy.shell_4}<span className="au-cart__count" data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="au-footer">
    <div className="au-footer__brand">
      <p className="au-footer__name">{store.name}</p>
      <p>{store.tagline || copy.shell_5}</p>
    </div>
    <nav className="au-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">{copy.shell_6}</a></nav>
    <p className="au-footer__note">{store.city ? `Desde ${store.city} · ` : ''}{copy.shell_7}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="au">
    <p className="au-announce">{copy.shell_8}</p>
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="au-status" />
  </div>;
}
