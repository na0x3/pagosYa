import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Plantas y flores', href: 'index.html#tienda' }, { label: 'Cuidados', href: 'index.html#cuidados' }, { label: 'Envíos', href: 'index.html#envios' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <header className="fl-header">
    <a className="fl-logo" href="index.html">{store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="fl-cart" data-cart-open>Carrito <span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="fl-footer">
    <p className="fl-footer__name">{store.name}</p>
    <p>{store.tagline || 'Plantas y flores para llenar de vida tu casa.'}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="fl-footer__legal">{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="fl">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="fl-status" />
  </div>;
}
