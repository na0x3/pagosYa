import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Novedades', href: 'index.html#novedades' }, { label: 'Colección', href: 'index.html#coleccion' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <header className="en-header">
    <a className="en-logo" href="index.html">{store.name}</a>
    <nav className="en-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="en-cart" data-cart-open>Mi bolsa <span className="en-cart__count" data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="en-footer">
    <p className="en-ornament" aria-hidden="true">✿</p>
    <p className="en-footer__name">{store.name}</p>
    <p>{store.tagline || 'Romance de otra época, para hoy.'}</p>
    <nav className="en-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="en-footer__note">{store.city ? `${store.city} · ` : ''}Pagos seguros con QR y tarjeta</p>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="en">
    <p className="en-announce">Envuelto con cariño en cada pedido ✿</p>
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="en-status" />
  </div>;
}
