import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Lo de hoy', href: 'index.html#hoy' }, { label: 'Nuestra cocina', href: 'index.html#cocina' }, { label: 'Pedidos', href: 'index.html#pedidos' }];

export function Header() {
  return <header className="mi-header">
    <a className="mi-logo" href="index.html">{store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="mi-cart" data-cart-open>Mi canasta <span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="mi-footer">
    <p className="mi-footer__name">{store.name}</p>
    <p>{store.tagline || 'Horneamos todos los días, con paciencia y mantequilla.'}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="mi-footer__legal">{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="mi">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="mi-status" />
  </div>;
}
