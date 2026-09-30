import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Tienda', href: 'index.html#tienda' }, { label: 'Rutina', href: 'index.html#rutina' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <header className="au-header">
    <nav className="au-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <a className="au-logo" href="index.html">{store.name}</a>
    <button type="button" className="au-cart" data-cart-open>Bolsa <span className="au-cart__count" data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="au-footer">
    <div className="au-footer__brand">
      <p className="au-footer__name">{store.name}</p>
      <p>{store.tagline || 'Cuidado diario, sin complicaciones.'}</p>
    </div>
    <nav className="au-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="au-footer__note">{store.city ? `Desde ${store.city} · ` : ''}Pagos seguros con QR y tarjeta</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="au">
    <p className="au-announce">Envíos a todo el país · Paga con QR o tarjeta</p>
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="au-status" />
  </div>;
}
