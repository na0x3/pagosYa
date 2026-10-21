import type { ReactNode } from 'react';
import { store, copy } from './store-data';

const links = [{ label: copy.shell_1, href: 'index.html#coleccion' }, { label: copy.shell_2, href: 'index.html#cuidados' }, { label: copy.shell_3, href: 'index.html#regalos' }, { label: copy.shell_4, href: 'index.html#preguntas' }];

export function Header() {
  return <header className="br-header">
    <a className="br-logo" href="index.html">{store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="br-cart" data-cart-open>{copy.shell_5}<span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="br-footer">
    <span className="br-diamond" aria-hidden="true">◆</span>
    <p className="br-footer__name">{store.name}</p>
    <p>{store.tagline || copy.shell_6}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">{copy.shell_7}</a></nav>
    <p className="br-footer__legal">{store.city ? `${store.city} · ` : ''}{copy.shell_8}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="br">
    <p className="br-announce">{copy.shell_9}</p>
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="br-status" />
  </div>;
}
