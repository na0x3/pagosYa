import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Cargar', href: 'index.html#productos' }, { label: 'Materiales', href: 'index.html#materiales' }, { label: 'Ayuda', href: 'index.html#ayuda' }];

export function Header() {
  return <header className="tz-header">
    <a className="tz-logo" href="index.html">{store.name}</a>
    <nav className="tz-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="tz-cart" data-cart-open>Carrito <span className="tz-cart__count" data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="tz-footer">
    <div>
      <p className="tz-footer__name">{store.name}</p>
      <p>{store.tagline || 'Accesorios que acompañan tu día.'}</p>
    </div>
    <nav className="tz-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="tz-footer__note">{store.city ? `Desde ${store.city} · ` : ''}Pagos seguros con QR y tarjeta</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="tz">
    <p className="tz-announce">Envío a todo el país · Dos años de garantía</p>
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="tz-status" />
  </div>;
}
