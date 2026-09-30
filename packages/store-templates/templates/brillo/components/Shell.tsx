import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Colección', href: 'index.html#coleccion' }, { label: 'Cuidados', href: 'index.html#cuidados' }, { label: 'Regalos', href: 'index.html#regalos' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <header className="br-header">
    <a className="br-logo" href="index.html">{store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="br-cart" data-cart-open>Bolsa · <span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="br-footer">
    <span className="br-diamond" aria-hidden="true">◆</span>
    <p className="br-footer__name">{store.name}</p>
    <p>{store.tagline || 'Piezas para guardar, usar y heredar.'}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="br-footer__legal">{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="br">
    <p className="br-announce">Empaque de regalo en cada pedido · Paga con QR o tarjeta</p>
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="br-status" />
  </div>;
}
