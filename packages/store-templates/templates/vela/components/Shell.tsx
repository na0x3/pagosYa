import type { ReactNode } from 'react';
import { store, copy } from './store-data';

const links = [{ label: copy.shell_1, href: 'index.html#coleccion' }, { label: copy.shell_2, href: 'index.html#ritual' }, { label: copy.shell_3, href: 'index.html#regalos' }, { label: copy.shell_4, href: 'index.html#preguntas' }];

export function Header() {
  return <header className="ve-header">
    <a className="ve-logo" href="index.html">{store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ve-cart" data-cart-open>{copy.shell_5}<span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="ve-footer">
    <p className="ve-footer__name">{store.name}</p>
    <p>{store.tagline || copy.shell_6}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">{copy.shell_7}</a></nav>
    <p className="ve-footer__legal">{store.city ? `${store.city} · ` : ''}{copy.shell_8}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ve">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ve-status" />
  </div>;
}
