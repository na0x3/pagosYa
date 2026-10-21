import type { ReactNode } from 'react';
import { store, copy } from './store-data';

const links = [{ label: copy.shell_1, href: 'index.html#comprar' }, { label: copy.shell_2, href: 'index.html#beneficios' }, { label: copy.shell_3, href: 'index.html#uso' }, { label: copy.shell_4, href: 'index.html#preguntas' }];

export function Header() {
  return <>
    <p className="so-announce"><span>{copy.shell_5}</span><span>{copy.shell_6}</span><span>{copy.shell_7}</span></p>
    <header className="so-header">
      <a className="so-logo" href="index.html">{store.name}</a>
      <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
      <button type="button" className="so-cart" data-cart-open>{copy.shell_8}<span data-cart-count>0</span></button>
    </header>
  </>;
}

export function Footer() {
  return <footer className="so-footer">
    <div><p className="so-footer__name">{store.name}</p><p>{store.tagline || copy.shell_9}</p></div>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">{copy.shell_10}</a></nav>
    <p className="so-footer__legal">{store.city ? `${store.city} · ` : ''}{copy.shell_11}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
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
