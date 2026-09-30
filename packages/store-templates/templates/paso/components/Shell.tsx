import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Zapatillas', href: 'index.html#tienda' }, { label: 'Materiales', href: 'index.html#materiales' }, { label: 'Ayuda', href: 'index.html#ayuda' }];

export function Header() {
  return <header className="ps-header">
    <a className="ps-logo" href="index.html">{store.name}</a>
    <nav className="ps-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ps-cart" data-cart-open>Carrito <span className="ps-cart__count" data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="ps-footer">
    <div>
      <p className="ps-footer__name">{store.name}</p>
      <p>{store.tagline || 'Cómodas desde el primer paso.'}</p>
    </div>
    <nav className="ps-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="ps-footer__note">{store.city ? `Desde ${store.city} · ` : ''}Pagos seguros con QR y tarjeta</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ps">
    <p className="ps-announce">Pruébalas 30 días · Cambios sin costo</p>
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ps-status" />
  </div>;
}
