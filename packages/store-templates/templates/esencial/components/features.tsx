import { useState } from 'react';
import { features, variants } from './store-data';
import { IconArrowRight } from './icons';

/** John Smedley sections (spec 2026-10-21): the rolled home sections, drawn from the data the platform wrote to store-data.
 *  Each has a fixed place on the home (a slot), so two of them never sit side by side. */
type Slot = 'products' | 'story' | 'values' | 'closing';
const SLOTS: Record<string, Slot> = { duo: 'products', explore: 'story', capsule: 'story', origin: 'values', palette: 'closing' };
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Duo({ halves }: { halves: Array<{ photo: string; title: string; cta: string; href: string }> }) {
  return <section className="es-duo" aria-label="Destacados">
    {halves.map(half => <a key={half.href + half.title} className="es-duo__half" href={half.href}>
      {half.photo ? <img src={half.photo} alt="" aria-hidden="true" loading="lazy" /> : null}
      <span className="es-duo__copy"><h2 className="es-duo__title">{half.title}</h2><span className="es-duo__cta">{half.cta}</span></span>
    </a>)}
  </section>;
}

function Explore({ photo, categories, colours }: { photo: string; categories: Array<{ id: string; name: string }>; colours: Array<{ value: string; name: string; hex: string }> }) {
  const [current, setCurrent] = useState(0);
  const [colour, setColour] = useState('');
  const category = categories[current] ?? categories[0];
  return <section className="es-section es-explore" aria-labelledby="es-explore-title">
    <div className="es-explore__main">
      <div className="es-explore__chips" role="group" aria-label="Categorías">
        {categories.map((entry, index) => <button key={entry.id} type="button" aria-pressed={index === current} onClick={() => setCurrent(index)}>{entry.name}</button>)}
      </div>
      {colours.length ? <div className="es-explore__colours" role="group" aria-label="Colores">
        {colours.map(entry => <button key={entry.value} type="button" aria-pressed={colour === entry.value} aria-label={entry.name} title={entry.name} onClick={() => setColour(colour === entry.value ? '' : entry.value)}><span style={{ background: entry.hex }} /></button>)}
      </div> : null}
      <h2 id="es-explore-title" className="es-h2">{category?.name}</h2>
      <div className="es-explore__rail" data-pagosya-catalog data-category={category?.id} data-color={colour || undefined} data-explore-rail />
      <a className="es-link" href={category ? `productos.html?f_categoria=${encodeURIComponent(fold(category.id))}` : 'productos.html'}>Ver todo <IconArrowRight /></a>
    </div>
    {photo ? <img className="es-explore__photo" src={photo} alt="" aria-hidden="true" loading="lazy" /> : null}
  </section>;
}

function Capsule({ photo, text, cta, products }: { photo: string; text: string; cta: string; products: string[] }) {
  return <section className="es-section es-capsule" aria-label="Selección">
    {photo ? <div className="es-capsule__media"><img src={photo} alt="" aria-hidden="true" loading="lazy" /></div> : null}
    <div className="es-capsule__copy">
      <p className="es-capsule__text">{text}</p>
      <a className="es-btn es-btn--ghost" href="productos.html">{cta}</a>
      <div className="es-capsule__cards" data-pagosya-catalog data-products={products.join(',')} />
    </div>
  </section>;
}

function Origin({ photo, caption, link, href }: { photo: string; caption: string; link: string; href: string }) {
  return <section className="es-origin" aria-label={caption}>
    <figure className="es-origin__figure">
      {photo ? <img src={photo} alt="" aria-hidden="true" loading="lazy" /> : null}
      <figcaption><p className="es-origin__caption">{caption}</p><a className="es-origin__link" href={href}>{link}</a></figcaption>
    </figure>
  </section>;
}

function Palette({ intro, colours }: { intro: string; colours: Array<{ name: string; hex: string; href: string }> }) {
  return <section className="es-section es-palette" aria-labelledby="es-palette-title">
    <div className="es-palette__head"><h2 id="es-palette-title" className="es-h2">Por color</h2><p>{intro}</p></div>
    <ul className="es-palette__tiles">{colours.map(entry => <li key={entry.href}><a href={entry.href}><span className="es-palette__swatch" style={{ background: entry.hex }} aria-hidden="true" /><span>{entry.name}</span></a></li>)}</ul>
  </section>;
}

export function FeatureSlot({ at }: { at: Slot }) {
  const rolled = String(variants.feature ?? '').split(',').filter(id => SLOTS[id] === at && features[id]);
  return <>{rolled.map(id => {
    const data = features[id];
    if (id === 'duo' && data.halves?.length === 2) return <Duo key={id} halves={data.halves} />;
    if (id === 'explore' && data.categories?.length >= 2) return <Explore key={id} photo={data.photo} categories={data.categories} colours={data.colours ?? []} />;
    if (id === 'capsule') return <Capsule key={id} photo={data.photo} text={data.text} cta={data.cta} products={data.products ?? []} />;
    if (id === 'origin') return <Origin key={id} photo={data.photo} caption={data.caption} link={data.link} href={data.href} />;
    if (id === 'palette' && data.colours?.length) return <Palette key={id} intro={data.intro} colours={data.colours} />;
    return null;
  })}</>;
}
