import type { ReactNode } from 'react';
import { store, copy } from './store-data';

const links = [{ label: copy.shell_1, href: 'index.html#cafes' }, { label: copy.shell_2, href: 'index.html#origen' }, { label: copy.shell_3, href: 'index.html#suscripcion' }, { label: copy.shell_4, href: 'index.html#preguntas' }];

export function Header() {
  return <>
    <p className="tv-announce">{copy.shell_5}</p>
    <header className="tv-header">
      <a className="tv-logo" href="index.html">{store.name}</a>
      <nav className="tv-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
      <button type="button" className="tv-cart" data-cart-open>{copy.shell_6}<span data-cart-count>0</span>)</button>
    </header>
  </>;
}

export function Footer() {
  return <footer className="tv-footer">
    <div>
      <p className="tv-footer__name">{store.name}</p>
      <p className="tv-footer__line">{store.tagline || copy.shell_7}</p>
    </div>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">{copy.shell_8}</a></nav>
    <p className="tv-footer__legal">{store.city ? `${store.city} · ` : ''}{copy.shell_9}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="tv">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="tv-status" />
  </div>;
}
