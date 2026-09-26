import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Comprar', href: 'index.html#comprar' }, { label: 'Beneficios', href: 'index.html#beneficios' }, { label: 'Cómo se usa', href: 'index.html#uso' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <>
    <p className="so-announce"><span>Paga con QR o tarjeta</span><span>Envíos a todo el país</span><span>Te ayudamos por mensaje</span></p>
    <header className="so-header">
      <a className="so-logo" href="index.html">{store.name}</a>
      <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
      <button type="button" className="so-cart" data-cart-open>Carrito <span data-cart-count>0</span></button>
    </header>
  </>;
}

export function Footer() {
  return <footer className="so-footer">
    <div><p className="so-footer__name">{store.name}</p><p>{store.tagline || 'Un producto, hecho muy bien.'}</p></div>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="so-footer__legal">{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="so">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="so-status" />
  </div>;
}
