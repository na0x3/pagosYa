import type { ReactNode } from 'react';
import { store, copy } from './store-data';

const links = [{ label: copy.shell_1, href: 'index.html' }, { label: copy.shell_2, href: 'index.html#productos' }, { label: copy.shell_3, href: 'index.html#preguntas' }];

export function Header() {
  return <header className="cr-header">
    <nav className="cr-nav" aria-label="Principal">{links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}</nav>
    <a className="cr-logo" href="index.html">{store.name}</a>
    <button type="button" className="cr-cart" data-cart-open>{copy.shell_4}<span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="cr-footer">
    <div><p className="cr-footer__name">{store.name}</p><p className="cr-footer__line">{store.tagline || copy.shell_5}</p></div>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}<a href="checkout.html">{copy.shell_6}</a></nav>
    <p className="cr-footer__legal">{store.city ? `${store.city} · ` : ''}{copy.shell_7}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="cr">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="cr-status" />
  </div>;
}
