import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Productos', href: 'index.html#productos' }, { label: 'Nosotros', href: 'index.html#nosotros' }, { label: 'Preguntas', href: 'index.html#preguntas' }];
const ticker = ['Paga con QR o tarjeta', 'Envíos a todo el país', 'Hecho para el día a día', 'Te respondemos rápido'];

export function Marquee() {
  const row = [...ticker, ...ticker];
  return <div className="ch-marquee" aria-hidden="true"><div className="ch-marquee__track">{[...row, ...row].map((text, index) => <span key={index}>{text} <i>✦</i></span>)}</div></div>;
}

export function Header() {
  return <header className="ch-header">
    <nav className="ch-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <a className="ch-logo" href="index.html">{store.name}<sup aria-hidden="true">✦</sup></a>
    <button type="button" className="ch-cart" data-cart-open><span>Carrito</span><b data-cart-count>0</b></button>
  </header>;
}

export function Footer() {
  return <footer className="ch-footer">
    <p className="ch-footer__name">{store.name}</p>
    <p className="ch-footer__line">{store.tagline || 'Cosas lindas que te alegran el día.'}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="ch-footer__legal">{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="ch">
    <Header />
    <Marquee />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="ch-status" />
  </div>;
}
