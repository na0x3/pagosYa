import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Productos', href: 'index.html#productos' }, { label: 'De dónde viene', href: 'index.html#origen' }, { label: 'Canasta', href: 'index.html#canasta' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <header className="hu-header">
    <a className="hu-logo" href="index.html"><span aria-hidden="true">❦</span> {store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="hu-cart" data-cart-open>Canasta <span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="hu-footer">
    <div><p className="hu-footer__name">{store.name}</p><p>{store.tagline || 'De la tierra a tu mesa, sin intermediarios.'}</p></div>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="hu-footer__legal">{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="hu">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="hu-status" />
  </div>;
}
