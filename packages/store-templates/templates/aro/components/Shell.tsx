import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Joyas', href: 'index.html#joyas' }, { label: 'Regalos', href: 'index.html#regalos' }, { label: 'Ayuda', href: 'index.html#ayuda' }];

export function Header() {
  return <header className="ar-header">
    <nav className="ar-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <a className="ar-logo" href="index.html">{store.name}</a>
    <button type="button" className="ar-cart" data-cart-open>Bolsa <span className="ar-cart__count" data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="ar-footer">
    <div>
      <p className="ar-footer__name">{store.name}</p>
      <p>{store.tagline || 'Joyas finas para todos los días.'}</p>
    </div>
    <nav className="ar-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="ar-footer__note">{store.city ? `${store.city} · ` : ''}Pagos seguros con QR y tarjeta</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ar">
    <p className="ar-announce">Empaque de regalo en cada pedido</p>
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ar-status" />
  </div>;
}
