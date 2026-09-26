import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Productos', href: 'index.html#productos' }, { label: 'Por qué aquí', href: 'index.html#por-que' }, { label: 'Soporte', href: 'index.html#preguntas' }];

export function Header() {
  return <header className="px-header">
    <a className="px-logo" href="index.html">{store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="px-cart" data-cart-open>Carrito <span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="px-footer">
    <div><p className="px-footer__name">{store.name}</p><p>{store.tagline || 'Tecnología que se usa todos los días.'}</p></div>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="px-footer__legal">{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="px">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="px-status" />
  </div>;
}
