import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Colección', href: 'index.html#coleccion' }, { label: 'Lookbook', href: 'index.html#lookbook' }, { label: 'Info', href: 'index.html#preguntas' }];

export function Header() {
  return <header className="ur-header">
    <a className="ur-logo" href="index.html">{store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>[ {link.label} ]</a>)}</nav>
    <button type="button" className="ur-cart" data-cart-open>Carrito [<span data-cart-count>0</span>]</button>
  </header>;
}

export function Footer() {
  return <footer className="ur-footer">
    <p className="ur-footer__name">{store.name}</p>
    <div className="ur-footer__row">
      <p>{store.tagline || 'Hecho para la calle.'}</p>
      <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
      <p>{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
    </div>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ur">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ur-status" />
  </div>;
}
