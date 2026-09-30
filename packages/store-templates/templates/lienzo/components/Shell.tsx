import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Obras', href: 'index.html#obras' }, { label: 'Artista', href: 'index.html#artista' }, { label: 'Impresión y envío', href: 'index.html#envio' }];

export function Header() {
  return <header className="li-header">
    <a className="li-logo" href="index.html">{store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="li-cart" data-cart-open>Carrito (<span data-cart-count>0</span>)</button>
  </header>;
}

export function Footer() {
  return <footer className="li-footer">
    <p className="li-footer__name">{store.name}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="li-footer__legal">{store.tagline || 'Obras para vivir con ellas.'}{store.city ? ` — ${store.city}` : ''} — Pagos seguros con pagosYa</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="li">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="li-status" />
  </div>;
}
