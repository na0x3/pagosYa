import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Clases', href: 'index.html#clases' }, { label: 'El estudio', href: 'index.html#estudio' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <header className="pa2-header">
    <a className="pa2-logo" href="index.html">{store.name}</a>
    <nav className="pa2-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="pa2-cart" data-cart-open>Mis clases <span className="pa2-cart__count" data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="pa2-footer">
    <p className="pa2-footer__name">{store.name}</p>
    <p>{store.tagline || 'Muévete con calma, sal con energía.'}</p>
    <nav className="pa2-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="pa2-footer__note">{store.city ? `${store.city} · ` : ''}Paga con QR o tarjeta</p>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="pa2">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="pa2-status" />
  </div>;
}
