import type { ReactNode } from 'react';
import { store, copy } from './store-data';

const links = [{ label: copy.shell_1, href: 'index.html#ambientes' }, { label: copy.shell_2, href: 'index.html#tienda' }, { label: copy.shell_3, href: 'index.html#materiales' }, { label: copy.shell_4, href: 'index.html#ayuda' }];

export function Header() {
  return <header className="ni-header">
    <a className="ni-logo" href="index.html">{store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ni-cart" data-cart-open>{copy.shell_5}<span data-cart-count>0</span>)</button>
  </header>;
}

export function Footer() {
  return <footer className="ni-footer">
    <p className="ni-footer__name">{store.name}</p>
    <p className="ni-footer__line">{store.tagline || copy.shell_6}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">{copy.shell_7}</a></nav>
    <p className="ni-footer__legal">{store.city ? `${store.city} · ` : ''}{copy.shell_8}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ni">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ni-status" />
  </div>;
}
