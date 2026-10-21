import type { ReactNode } from 'react';
import { store, copy } from './store-data';

const links = [{ label: copy.shell_1, href: 'index.html#juguetes' }, { label: copy.shell_2, href: 'index.html#edades' }, { label: copy.shell_3, href: 'index.html#preguntas' }];

export function Header() {
  return <header className="ju-header">
    <a className="ju-logo" href="index.html">{store.name.split('').map((letter, index) => <span key={index}>{letter}</span>)}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ju-cart" data-cart-open>{copy.shell_4}<span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="ju-footer">
    <p className="ju-footer__name">{store.name}</p>
    <p>{store.tagline || copy.shell_5}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">{copy.shell_6}</a></nav>
    <p className="ju-footer__legal">{store.city ? `${store.city} · ` : ''}{copy.shell_7}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ju">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ju-status" />
  </div>;
}
