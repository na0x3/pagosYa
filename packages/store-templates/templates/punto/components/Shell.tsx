import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Productos', href: 'index.html#productos' }, { label: 'Diseño', href: 'index.html#diseno' }, { label: 'Ayuda', href: 'index.html#ayuda' }];

export function Header() {
  return <header className="pt-header">
    <a className="pt-logo" href="index.html"><span className="pt-logo__dot" aria-hidden="true" />{store.name}</a>
    <nav className="pt-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="pt-cart" data-cart-open>Carrito <span className="pt-cart__count" data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="pt-footer">
    <p className="pt-footer__name">{store.name}</p>
    <p className="pt-mono">{store.tagline || 'Tecnología, sin ruido.'}</p>
    <nav className="pt-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="pt-mono pt-footer__note">{store.city ? `${store.city} · ` : ''}Pagos seguros con QR y tarjeta</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="pt">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="pt-status" />
  </div>;
}
