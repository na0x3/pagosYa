import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Nuevo', href: 'index.html#tienda' }, { label: 'Tonos', href: 'index.html#tonos' }, { label: 'Talles', href: 'index.html#talles' }];

export function Header() {
  return <header className="pi-header">
    <nav className="pi-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <a className="pi-logo" href="index.html">{store.name}</a>
    <button type="button" className="pi-cart" data-cart-open>Bolsa (<span data-cart-count>0</span>)</button>
  </header>;
}

export function Footer() {
  return <footer className="pi-footer">
    <p className="pi-footer__name">{store.name}</p>
    <nav className="pi-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="pi-footer__note">{store.tagline || 'Básicos que se sienten como tu piel.'}{store.city ? ` · ${store.city}` : ''}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="pi">
    <p className="pi-announce">Envío gratis desde 2 prendas · Cambios fáciles</p>
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="pi-status" />
  </div>;
}
