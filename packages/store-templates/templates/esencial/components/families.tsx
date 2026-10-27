import type { ReactNode } from 'react';
import { copy, sections, store } from './store-data';
import { IconCheck, IconShieldCheck, IconStar, IconTruck } from './icons';

/** Owner 2026-10-27 («i feel like they are still the same way too much»): template families — one template, different
 *  skeletons. The family (variants.family) changes the hero's inside, adds the blocks below and reorders the home with CSS order
 *  (styles/globals.css); every section stays a direct child of <main>, so YAPI still finds each one by its id. */
export const FAMILIES = ['esencial', 'pop', 'revista', 'heroe', 'boutique', 'menu'];

/** Pop (PEPPA please rev 18): the hero's photo or video in a tilted frame, with the store's tagline as a sticker. */
export function PopMedia({ children }: { children: ReactNode }) {
  return <figure className="es-pop__media">{children}{copy.tagline ? <span className="es-pop__sticker">{copy.tagline}</span> : null}</figure>;
}

/** Revista: the issue line and the store's name as a magazine masthead above the cover. */
export function RevistaTop() {
  return <div className="es-mast">
    <p className="es-mast__top"><span>{store.city || 'Edición'}</span>{copy.eyebrow ? <span>{copy.eyebrow}</span> : null}<span>{new Date().getFullYear()}</span></p>
    <p className="es-mast__name" aria-hidden="true" style={{ ['--mast-chars' as string]: Math.max(4, store.name.length) } as never}>{store.name}</p>
  </div>;
}

/** Pop: three promises in a row under the hero, each with an icon — the store's own values, never invented. */
export function TrustRow() {
  const icons = [IconTruck, IconCheck, IconStar, IconShieldCheck];
  if (copy.values.length < 2) return null;
  return <div className="es-trust" aria-label="Por qué comprarnos">{copy.values.slice(0, 3).map((value, index) => {
    const Icon = icons[index % icons.length];
    return <p key={value.title}><Icon /><span><strong>{value.title}</strong>{value.text ? <small>{value.text}</small> : null}</span></p>;
  })}</div>;
}

/** Pop: the store's real offer (its announcement) as a loyalty card with a stamp row; nothing when it has none. */
export function LoyaltyCard() {
  if (!copy.announcement) return null;
  return <div className="es-section es-loyalty" aria-label="Oferta">
    <div className="es-loyalty__card">
      <p className="es-eyebrow">{store.name}</p>
      <h2 className="es-h2">{copy.announcement}</h2>
      <a className="es-btn es-btn--accent" href="productos.html">{copy.primaryCta}</a>
      <p className="es-loyalty__stamps" aria-hidden="true">{[0, 1, 2, 3, 4].map(index => <i key={index} data-on={index < 4 ? '' : undefined} />)}</p>
    </div>
  </div>;
}

/** Revista: «En esta edición», an index of the page's own sections. */
export function EditionIndex() {
  const entries = ([[copy.productsTitle, '#productos'], [copy.storyTitle, '#historia'], ...sections.map(section => [section.title, `#${section.id}`])] as Array<[string, string]>)
    .filter(([title]) => Boolean(title)).slice(0, 6);
  if (entries.length < 2) return null;
  return <nav className="es-section es-index" aria-label="En esta edición">
    <p className="es-eyebrow">En esta edición</p>
    <ol>{entries.map(([title, href], index) => <li key={href}><a href={href}><span>{String(index + 1).padStart(2, '0')}</span>{title}</a></li>)}</ol>
  </nav>;
}
