import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Servicios', href: 'index.html#servicios' }, { label: 'Cómo trabajamos', href: 'index.html#como' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <header className="ta-header">
    <a className="ta-logo" href="index.html"><span aria-hidden="true">■</span>{store.name}</a>
    <nav className="ta-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ta-cart" data-cart-open>Mi pedido <span className="ta-cart__count" data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="ta-footer">
    <div>
      <p className="ta-footer__name">{store.name}</p>
      <p>{store.tagline || 'Técnicos de confianza, a tu puerta.'}</p>
    </div>
    <nav className="ta-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="ta-footer__note">{store.city ? `Atendemos en ${store.city} · ` : ''}Paga con QR o tarjeta</p>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ta">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ta-status" />
  </div>;
}
