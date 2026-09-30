import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Colección', href: 'index.html#coleccion' }, { label: 'Lookbook', href: 'index.html#lookbook' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <header className="pa-header">
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <a className="pa-header__name" href="index.html">{store.name}</a>
    <button type="button" className="pa-cart" data-cart-open>Bolsa (<span data-cart-count>0</span>)</button>
  </header>;
}

export function Footer() {
  return <footer className="pa-footer">
    <p className="pa-footer__name">{store.name}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="pa-footer__legal">{store.tagline || 'Prendas para usar mucho tiempo.'}{store.city ? ` · ${store.city}` : ''} · Pagos seguros con pagosYa</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="pa">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="pa-status" />
  </div>;
}
