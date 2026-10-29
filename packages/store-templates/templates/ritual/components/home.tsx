import { useEffect, useState } from 'react';
import { Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { copy, photos, sections, store } from './store-data';
import { variant } from './Shell';
import { FeatureSlot } from './features';
import { StoreModule } from './modules';
import { MotionKit, Words } from './motion';
import { EffectLayer } from './effects';
import { IconArrowRight, IconCheck, IconPlus, IconStar } from './icons';

/** Owner 2026-10-27 (industry skeletons, «never the same»): Ritual is the beauty and self-care skeleton — a soft cover, the brand's
 *  promises as badges, the range on rounded cards, the routine as big numbered steps beside a photo, ingredients as cards, reviews up
 *  front and a soft gradient closing. Same store-data as Esencial, so the same fill writes it; the cover, grid and closing vary per store. */

/** One file can be spelled «assets/x.jpg», «/assets/x.jpg» or a full URL (eval 2026-10-28: NOA's hero came back three times), so a
 *  photo is known by its file name. */
const photoKey = (src: string) => src.split(/[?#]/)[0].split('/').pop() || src;
const samePhoto = (a: string | undefined, b: string | undefined) => Boolean(a && b && photoKey(a) === photoKey(b));
const unique = (list: Array<string | undefined>) => { const seen = new Set<string>(); return list.filter((src): src is string => Boolean(src) && !seen.has(photoKey(src!)) && Boolean(seen.add(photoKey(src!)))); };

/** The store's spare photos, then each product's second photo, so every spread has a picture and none repeats (owner 2026-10-27). */
function useSpreadPhotos(own: string[], taken: Array<string | undefined>): string[] {
  const [products, setProducts] = useState<string[]>([]);
  useEffect(() => {
    const items = ((window as unknown as { PAGOSYA_CONFIG?: { data?: { items?: Array<{ imageUrls?: string[] }> } } }).PAGOSYA_CONFIG?.data?.items) ?? [];
    setProducts(unique([...items.map(item => item.imageUrls?.[1]), ...items.map(item => item.imageUrls?.[0])]));
  }, []);
  const skip = new Set(taken.filter((src): src is string => Boolean(src)).map(photoKey));
  return unique([...own, ...products]).filter(src => !skip.has(photoKey(src)));
}

export default function Home() {
  const storyPhoto = unique([photos.story, photos.p1, photos.p2]).find(src => !samePhoto(src, photos.hero));
  const spreadPhotos = useSpreadPhotos(unique([photos.b1, photos.b2, photos.b3, photos.b4, photos.b5, photos.b6, photos.p1, photos.p2, photos.p3, photos.p4]), [photos.hero, storyPhoto]);
  // Each photo once (owner 2026-10-28: ZARA's sections repeated the same pictures); a spread past the last photo is words only.
  const photoAt = (index: number) => spreadPhotos[index];
  const cards = variant('cards', 'compact');
  const hero = ['split-left', 'full', 'stack'].includes(variant('hero', 'split-left')) ? variant('hero', 'split-left') : 'split-left';
  const range = ['grid4', 'grid3', 'strip'].includes(variant('grid', 'grid4')) ? variant('grid', 'grid4') : 'grid4';
  return <Shell>
    <main id="contenido" className="rt-home">
      <MotionKit />
      <section id="inicio" className="rt-cover" data-rt-hero={hero} aria-labelledby="rt-hero-title">
        <EffectLayer />
        <div className="rt-cover__copy">
          {copy.eyebrow ? <p className="rt-kicker">{copy.eyebrow}</p> : null}
          <h1 id="rt-hero-title" className="rt-cover__title"><Words text={copy.headline} /></h1>
          {copy.subcopy ? <p className="rt-cover__sub">{copy.subcopy}</p> : null}
          <div className="rt-actions">
            <a className="es-btn es-btn--accent" href="#productos">{copy.primaryCta}</a>
            {copy.secondaryCta ? <a className="es-btn es-btn--ghost" href="#historia">{copy.secondaryCta}</a> : null}
          </div>
        </div>
        <div className="rt-cover__media" data-mo="parallax" data-mo-speed="0.05">
          {photos.heroVideo ? <video src={photos.heroVideo} autoPlay muted loop playsInline poster={photos.hero} aria-hidden="true" />
            : photos.hero ? <img src={photos.hero} alt="" aria-hidden="true" data-mo="tilt" /> : null}
        </div>
      </section>

      <section id="valores" className="rt-badges" data-mo="rise" aria-label="Lo que prometemos">
        <ul>{copy.values.map(value => <li key={value.title} data-mo-item><IconCheck /><span><strong>{value.title}</strong>{value.text ? <small>{value.text}</small> : null}</span></li>)}</ul>
      </section>

      <section id="productos" className="rt-range" data-rt-range={range} data-mo="rise" aria-labelledby="rt-products-title">
        <div className="rt-head">
          <h2 id="rt-products-title" className="rt-h2">{copy.productsTitle}</h2>
          <a className="es-link" href="productos.html">Ver todo <IconArrowRight /></a>
        </div>
        <div className="rt-range__cats" data-pagosya-categories hidden />
        {cards === 'fashion' ? null : <template data-pagosya-product-template>
          <article className="es-card rt-card" data-es-card="plain">
            <a className="es-card__media rt-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <p className="es-card__eyebrow" data-product-field="eyebrow" hidden />
            <h3 className="es-card__name" data-product-field="name">Producto</h3>
            <p className="es-card__chips" data-product-field="chips" hidden />
            <p className="es-card__deal" data-product-field="deal" hidden />
            <div className="rt-card__foot">
              <p className="es-card__price" data-product-field="price" />
              <button type="button" className="rt-card__add" data-product-add aria-label="Agregar"><IconPlus /></button>
            </div>
          </article>
        </template>}
        <div className="es-grid rt-grid" data-es-grid="grid4" data-es-cards={cards} data-pagosya-catalog data-pagosya-filters data-mo-cards />
      </section>

      <FeatureSlot at="products" />

      <section id="historia" className={storyPhoto ? 'rt-spread' : 'rt-spread rt-spread--text'} data-mo="rise" aria-labelledby="rt-story-title">
        {storyPhoto ? <Reveal className="rt-spread__media"><img src={storyPhoto} alt="" aria-hidden="true" loading="lazy" data-mo="tilt" /></Reveal> : null}
        <Reveal className="rt-spread__copy" delay={120}>
          <p className="rt-kicker">{store.name}</p>
          <h2 id="rt-story-title" className="rt-h2">{copy.storyTitle}</h2>
          <p>{copy.storyBody}</p>
        </Reveal>
      </section>

      {sections.map((section, index) => <Spread key={section.id} section={section} index={index} photo={photoAt(index)} />)}

      <StoreModule photo={photoAt(sections.length)} />

      <section id="resenas" className="rt-section rt-reviews" data-pagosya-reviews-section data-mo="rise" aria-labelledby="rt-reviews-title">
        <p className="rt-kicker"><IconStar /> <IconStar /> <IconStar /> <IconStar /> <IconStar /></p>
        <h2 id="rt-reviews-title" className="rt-h2">Lo que dicen de su rutina</h2>
        <div className="es-reviews__list" data-pagosya-reviews />
      </section>

      <FeatureSlot at="closing" />

      <section id="cierre" className="rt-closing" data-rt-closing={variant('closing', 'accent')} data-mo="rise" aria-labelledby="rt-closing-title">
        <EffectLayer />
        <h2 id="rt-closing-title" className="rt-closing__title">{copy.closingLine}</h2>
        <a className="es-btn es-btn--accent" href="productos.html">{copy.closingCta} <IconArrowRight /></a>
      </section>
    </main>
  </Shell>;
}

// Below the home on purpose: YAPI reads the file's first <section> as «la sección principal», which must be the cover.
type Section = { id: string; title: string; items: Array<{ title: string; text: string }> };

/** The routine as big numbered steps, ingredients as cards, the rest as photo | text spreads (the side alternating). */
function Spread({ section, index, photo }: { section: Section; index: number; photo?: string }) {
  const { id, title, items } = section;
  if (id === 'gallery') return null;
  return <section id={id} className={photo ? 'rt-spread' : 'rt-spread rt-spread--text'} data-rt-side={index % 2 ? 'right' : 'left'} data-rt-section={id} data-mo="rise" aria-labelledby={`rt-${id}-title`}>
    {photo ? <Reveal className="rt-spread__media"><img src={photo} alt="" aria-hidden="true" loading="lazy" data-mo="tilt" /></Reveal> : null}
    <Reveal className="rt-spread__copy" delay={120}>
      <h2 id={`rt-${id}-title`} className="rt-h2">{title}</h2>
      {id === 'process' || id === 'howto' ? <ol className="rt-steps">{items.map((item, n) => <li key={n} data-mo-item><span>{n + 1}</span><div><h3 className="es-h3">{item.title}</h3><p>{item.text}</p></div></li>)}</ol>
        : id === 'materials' || id === 'pick' ? <ul className="rt-ingredients">{items.map((item, n) => <li key={n} data-mo-item><h3 className="es-h3">{item.title}</h3><p>{item.text}</p></li>)}</ul>
        : id === 'faq' ? <div className="rt-faq">{items.map((item, n) => <details key={n}><summary>{item.title}</summary><p>{item.text}</p></details>)}</div>
        : id === 'quotes' ? <div className="rt-quotes">{items.map((item, n) => <blockquote key={n}><p>«{item.text}»</p><cite>{item.title}</cite></blockquote>)}</div>
        : id === 'sizes' ? <table className="es-biz__table"><tbody>{items.map((item, n) => <tr key={n}><th scope="row">{item.title}</th><td>{item.text}</td></tr>)}</tbody></table>
        : id === 'blog' ? <div className="es-biz__blog" data-pagosya-blog />
        : <ul className="rt-list">{items.map((item, n) => <li key={n}><h3 className="es-h3">{item.title}</h3><p>{item.text}</p></li>)}</ul>}
    </Reveal>
  </section>;
}
