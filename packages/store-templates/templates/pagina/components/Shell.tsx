import type { ReactNode } from 'react';
import { store } from './store-data';

const links = [{ label: 'Libros', href: 'index.html#libros' }, { label: 'Para leer en casa', href: 'index.html#en-casa' }, { label: 'La librería', href: 'index.html#libreria' }, { label: 'Preguntas', href: 'index.html#preguntas' }];

export function Header() {
  return <>
    <p className="pg-announce">Recomendaciones de la casa cada semana · Envolvemos para regalo</p>
    <header className="pg-header">
      <a className="pg-logo" href="index.html"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5C5.5 4 8.5 4 12 6c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5z" /><path d="M12 6v13.5" /></svg>{store.name}</a>
      <nav aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
      <button type="button" className="pg-cart" data-cart-open>Mi bolsa (<span data-cart-count>0</span>)</button>
    </header>
  </>;
}

export function Footer() {
  return <footer className="pg-footer">
    <div><p className="pg-footer__name">{store.name}</p><p>{store.tagline || 'Libros elegidos uno por uno, para leer sin apuro.'}</p></div>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="pg-footer__legal">{store.city ? `${store.city} · ` : ''}Pagos seguros con pagosYa</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="pg">
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="pg-status" />
  </div>;
}
