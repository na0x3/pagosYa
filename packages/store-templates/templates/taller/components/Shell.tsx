import type { ReactNode } from 'react';
import { store, copy } from './store-data';

const links = [{ label: copy.shell_1, href: 'index.html#servicios' }, { label: copy.shell_2, href: 'index.html#como' }, { label: copy.shell_3, href: 'index.html#preguntas' }];

export function Header() {
  return <header className="ta-header">
    <a className="ta-logo" href="index.html"><span aria-hidden="true">■</span>{store.name}</a>
    <nav className="ta-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ta-cart" data-cart-open>{copy.shell_4}<span className="ta-cart__count" data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="ta-footer">
    <div>
      <p className="ta-footer__name">{store.name}</p>
      <p>{store.tagline || copy.shell_5}</p>
    </div>
    <nav className="ta-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">{copy.shell_6}</a></nav>
    <p className="ta-footer__note">{store.city ? `Atendemos en ${store.city} · ` : ''}{copy.shell_7}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ta">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ta-status" />
  </div>;
}
