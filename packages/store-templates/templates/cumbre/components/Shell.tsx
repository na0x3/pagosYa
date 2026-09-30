import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Novedades', href: 'index.html#novedades' }, { label: 'Colección', href: 'index.html#coleccion' }, { label: 'Para cada salida', href: 'index.html#usos' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <>
    <p className="cu-announce">Envíos a todo el país · Paga con QR o tarjeta</p>
    <header className="cu-header">
      <a className="cu-logo" href="index.html"><span className="cu-logo__mark" aria-hidden="true">▲</span>{store.name}</a>
      <nav className="cu-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
      <button type="button" className="cu-cart" data-cart-open>Carrito <span data-cart-count>0</span></button>
    </header>
  </>;
}

export function Footer() {
  return <footer className="cu-footer">
    <div><p className="cu-footer__name">{store.name}</p><p>{store.tagline || 'Equipo para salir, volver y volver a salir.'}</p></div>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="cu-footer__legal">{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="cu">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="cu-status" />
  </div>;
}
