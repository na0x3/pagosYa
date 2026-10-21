import type { ReactNode } from 'react';
import { store, copy } from './store-data';

const links = [{ label: copy.shell_1, href: 'index.html#productos' }, { label: copy.shell_2, href: 'index.html#uso' }, { label: copy.shell_3, href: 'index.html#preguntas' }];

export function Header() {
  return <header className="ri-header">
    <a className="ri-logo" href="index.html">{store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ri-cart" data-cart-open>{copy.shell_4}<span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="ri-footer">
    <p className="ri-footer__name">{store.name}</p>
    <div className="ri-footer__row">
      <p>{store.tagline || copy.shell_5}</p>
      <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">{copy.shell_6}</a></nav>
      <p>{store.city ? `${store.city} · ` : ''}{copy.shell_7}</p>
    </div>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ri">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ri-status" />
  </div>;
}
