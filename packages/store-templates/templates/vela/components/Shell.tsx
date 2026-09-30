import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Colección', href: 'index.html#coleccion' }, { label: 'El ritual', href: 'index.html#ritual' }, { label: 'Regalos', href: 'index.html#regalos' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <header className="ve-header">
    <a className="ve-logo" href="index.html">{store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="ve-cart" data-cart-open>Bolsa · <span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="ve-footer">
    <p className="ve-footer__name">{store.name}</p>
    <p>{store.tagline || 'Aromas para volver a casa.'}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="ve-footer__legal">{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ve">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ve-status" />
  </div>;
}
