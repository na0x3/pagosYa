import type { ReactNode } from 'react';
import { store, copy } from './store-data';

const links = [{ label: copy.shell_1, href: 'index.html#tipos' }, { label: copy.shell_2, href: 'index.html#tipos' }, { label: copy.shell_3, href: 'index.html#productos' }, { label: copy.shell_4, href: 'index.html#consejos' }];

export function Paw({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="6" cy="10" rx="2.1" ry="2.6" /><ellipse cx="10" cy="6.2" rx="2.1" ry="2.6" /><ellipse cx="14.5" cy="6.2" rx="2.1" ry="2.6" /><ellipse cx="18.5" cy="10" rx="2.1" ry="2.6" /><path d="M12.2 11c3 0 6.3 4.5 5 7.2-1 2-3.2 1.2-5 1.2s-4 .8-5-1.2c-1.3-2.7 2-7.2 5-7.2z" /></svg>;
}

export function Header() {
  return <header className="hl-header">
    <a className="hl-logo" href="index.html"><Paw className="hl-logo__paw" />{store.name}</a>
    <nav aria-label="Principal">{links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="hl-cart" data-cart-open>{copy.shell_5}<span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="hl-footer">
    <p className="hl-footer__name">{store.name}</p>
    <p>{store.tagline || copy.shell_6}</p>
    <nav aria-label="Pie de página">{links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}<a href="checkout.html">{copy.shell_7}</a></nav>
    <p className="hl-footer__legal">{store.city ? `${store.city} · ` : ''}{copy.shell_8}</p>
    <nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="hl">
    <p className="hl-announce">{copy.shell_9}</p>
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="hl-status" />
  </div>;
}
