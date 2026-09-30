import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Tienda', href: 'index.html#tienda' }, { label: 'Quién lo hace', href: 'index.html#manos' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <header className="ra-header">
    <nav className="ra-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <a className="ra-logo" href="index.html">{store.name}</a>
    <button type="button" className="ra-cart" data-cart-open>Canasta (<span data-cart-count>0</span>)</button>
  </header>;
}

export function Footer() {
  return <footer className="ra-footer">
    <div>
      <p className="ra-footer__name">{store.name}</p>
      <p>{store.tagline || 'Objetos hechos a mano, con historia.'}</p>
    </div>
    <nav className="ra-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="ra-footer__note">{store.city ? `Desde ${store.city} · ` : ''}Comercio justo · Pagos con QR y tarjeta</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ra">
    <p className="ra-announce">Cada compra apoya a un taller artesanal</p>
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ra-status" />
  </div>;
}
