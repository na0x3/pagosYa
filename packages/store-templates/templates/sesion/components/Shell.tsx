import type { ReactNode } from 'react';
import { store, copy } from './store-data';

const links = [{ label: copy.shell_1, href: 'index.html#trabajos' }, { label: copy.shell_2, href: 'index.html#paquetes' }, { label: copy.shell_3, href: 'index.html#estudio' }];

export function Header() {
  return <header className="se-header">
    <a className="se-logo" href="index.html">{store.name}</a>
    <nav className="se-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="se-cart" data-cart-open>{copy.shell_4}<span data-cart-count>0</span>)</button>
  </header>;
}

export function Footer() {
  return <footer className="se-footer">
    <p className="se-footer__name">{store.name}</p>
    <div className="se-footer__row">
      <p>{store.tagline || copy.shell_5}</p>
      <nav className="se-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">{copy.shell_6}</a></nav>
    </div>
    <p className="se-footer__note">{store.city ? `${store.city} · ` : ''}{copy.shell_7}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="se">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="se-status" />
  </div>;
}
