import type { ReactNode } from 'react';
import { store, copy } from './store-data';

const links = [{ label: copy.shell_1, href: 'index.html#novedades' }, { label: copy.shell_2, href: 'index.html#coleccion' }, { label: copy.shell_3, href: 'index.html#usos' }, { label: copy.shell_4, href: 'index.html#preguntas' }];

export function Header() {
  return <>
    <p className="cu-announce">{copy.shell_5}</p>
    <header className="cu-header">
      <a className="cu-logo" href="index.html"><span className="cu-logo__mark" aria-hidden="true">▲</span>{store.name}</a>
      <nav className="cu-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
      <button type="button" className="cu-cart" data-cart-open>{copy.shell_6}<span data-cart-count>0</span></button>
    </header>
  </>;
}

export function Footer() {
  return <footer className="cu-footer">
    <div><p className="cu-footer__name">{store.name}</p><p>{store.tagline || copy.shell_7}</p></div>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">{copy.shell_8}</a></nav>
    <p className="cu-footer__legal">{store.city ? `${store.city} · ` : ''}{copy.shell_9}</p>
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
