import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Cafés', href: 'index.html#cafes' }, { label: 'Origen', href: 'index.html#origen' }, { label: 'Suscripción', href: 'index.html#suscripcion' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <>
    <p className="tv-announce">Tostado cada semana · Paga con QR o tarjeta</p>
    <header className="tv-header">
      <a className="tv-logo" href="index.html">{store.name}</a>
      <nav className="tv-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
      <button type="button" className="tv-cart" data-cart-open>Carrito (<span data-cart-count>0</span>)</button>
    </header>
  </>;
}

export function Footer() {
  return <footer className="tv-footer">
    <div>
      <p className="tv-footer__name">{store.name}</p>
      <p className="tv-footer__line">{store.tagline || 'Café de especialidad, tostado en pequeñas tandas.'}</p>
    </div>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="tv-footer__legal">{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="tv">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="tv-status" />
  </div>;
}
