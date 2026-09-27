import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Piezas', href: 'index.html#piezas' }, { label: 'El proceso', href: 'index.html#proceso' }, { label: 'Quién lo hace', href: 'index.html#taller' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <header className="ba-header">
    <a className="ba-logo" href="index.html">{store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ba-cart" data-cart-open>Carrito · <span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="ba-footer">
    <p className="ba-footer__name">{store.name}</p>
    <p>{store.tagline || 'Piezas hechas a mano, una por una.'}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="ba-footer__legal">{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ba">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ba-status" />
  </div>;
}
