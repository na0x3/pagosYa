import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Juguetes', href: 'index.html#juguetes' }, { label: 'Por edad', href: 'index.html#edades' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <header className="ju-header">
    <a className="ju-logo" href="index.html">{store.name.split('').map((letter, index) => <span key={index}>{letter}</span>)}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ju-cart" data-cart-open>Carrito <span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="ju-footer">
    <p className="ju-footer__name">{store.name}</p>
    <p>{store.tagline || 'Juguetes para crecer jugando.'}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="ju-footer__legal">{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ju">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ju-status" />
  </div>;
}
