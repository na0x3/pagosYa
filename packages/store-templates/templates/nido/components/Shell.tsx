import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Ambientes', href: 'index.html#ambientes' }, { label: 'Tienda', href: 'index.html#tienda' }, { label: 'Materiales', href: 'index.html#materiales' }, { label: 'Ayuda', href: 'index.html#ayuda' }];

export function Header() {
  return <header className="ni-header">
    <a className="ni-logo" href="index.html">{store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ni-cart" data-cart-open>Carrito (<span data-cart-count>0</span>)</button>
  </header>;
}

export function Footer() {
  return <footer className="ni-footer">
    <p className="ni-footer__name">{store.name}</p>
    <p className="ni-footer__line">{store.tagline || 'Objetos para una casa que se siente tuya.'}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="ni-footer__legal">{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ni">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ni-status" />
  </div>;
}
