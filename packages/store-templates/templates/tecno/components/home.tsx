import { useEffect, useState } from 'react';
import { Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { copy, photos, sections, store } from './store-data';
import { variant } from './Shell';
import { FeatureSlot } from './features';
import { StoreModule } from './modules';
import { MotionKit, Words } from './motion';
import { IconArrowRight, IconCheck, IconMessageCircle, IconPlus } from './icons';

/** Owner 2026-10-27 («skeletons for… electronics and housing»): Tecno is the electronics and appliances skeleton. A launch stage
 *  (the headline over the product on a deep ground), three key facts, the range by category with the specs on every card, then the
 *  sections as photo | text spreads and a deep closing. Same store-data as Esencial, so the same fill writes it. */

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
  const phone: string = store.phone;
  const whatsapp = phone ? `https://wa.me/${phone.replace(/\D/g, '')}` : '';
  const storyPhoto = unique([photos.story, photos.p1, photos.p2]).find(src => !samePhoto(src, photos.hero));
  const spreadPhotos = useSpreadPhotos(unique([photos.b1, photos.b2, photos.b3, photos.b4, photos.b5, photos.b6, photos.p1, photos.p2, photos.p3, photos.p4]), [photos.hero, storyPhoto]);
  // Each photo once (owner 2026-10-28: ZARA's sections repeated the same pictures); a spread past the last photo is words only.
  const photoAt = (index: number) => spreadPhotos[index];
  const cards = variant('cards', 'compact');
  // Owner 2026-10-27 («I don't like that entrance for Remolino»): Tecno's cover, range and closing have real alternatives the dice
  // pick per store — a light product split, a full photo, or the launch stage.
  const hero = ['split-left', 'full', 'framed'].includes(variant('hero', 'split-left')) ? variant('hero', 'split-left') : 'split-left';
  const range = ['grid4', 'grid3', 'strip'].includes(variant('grid', 'grid4')) ? variant('grid', 'grid4') : 'grid4';
  return <Shell>
    <main id="contenido" className="tc-home">
      <MotionKit />
      <section id="inicio" className="tc-stage" data-tc-hero={hero} aria-labelledby="tc-hero-title">
        <div className="tc-stage__copy">
          {copy.eyebrow ? <p className="tc-kicker">{copy.eyebrow}</p> : null}
          <h1 id="tc-hero-title" className="tc-stage__title"><Words text={copy.headline} /></h1>
          {copy.subcopy ? <p className="tc-stage__sub">{copy.subcopy}</p> : null}
          <div className="tc-actions">
            <a className="es-btn es-btn--accent tc-primary" href="#productos">{copy.primaryCta}</a>
            {copy.secondaryCta ? <a className="es-btn es-btn--ghost tc-ghost" href="#historia">{copy.secondaryCta}</a> : null}
          </div>
        </div>
        <div className="tc-stage__media" data-mo="parallax" data-mo-speed="0.08">
          {photos.heroVideo ? <video src={photos.heroVideo} autoPlay muted loop playsInline poster={photos.hero} aria-hidden="true" />
            : photos.hero ? <img src={photos.hero} alt="" aria-hidden="true" /> : null}
        </div>
        <ul className="tc-stage__facts" data-mo="rise">{copy.values.slice(0, 3).map(value => <li key={value.title} data-mo-item><p className="tc-fact__title">{value.title}</p><p className="tc-fact__text">{value.text}</p></li>)}</ul>
      </section>

      <section id="productos" className="tc-range" data-tc-range={range} data-mo="rise" aria-labelledby="tc-products-title">
        <div className="tc-head">
          <h2 id="tc-products-title" className="tc-h2">{copy.productsTitle}</h2>
          <a className="es-link" href="productos.html">Ver todo <IconArrowRight /></a>
        </div>
        <div className="tc-range__cats" data-pagosya-categories hidden />
        {cards === 'fashion' ? null : <template data-pagosya-product-template>
          <article className="es-card tc-card" data-es-card="plain">
            <a className="es-card__media tc-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <p className="es-card__eyebrow" data-product-field="eyebrow" hidden />
            <h3 className="es-card__name" data-product-field="name">Producto</h3>
            <ul className="es-card__points tc-card__specs" data-product-field="points" hidden />
            <p className="es-card__chips" data-product-field="chips" hidden />
            <p className="es-card__deal" data-product-field="deal" hidden />
            <div className="tc-card__foot">
              <p className="es-card__price" data-product-field="price" />
              <button type="button" className="tc-card__add" data-product-add><IconPlus /> Agregar</button>
            </div>
          </article>
        </template>}
        <div className="es-grid tc-grid" data-es-grid="grid4" data-es-cards={cards} data-pagosya-catalog data-pagosya-filters data-mo-cards />
      </section>

      <FeatureSlot at="products" />

      <section id="historia" className={storyPhoto ? 'tc-spread' : 'tc-spread tc-spread--text'} data-mo="rise" aria-labelledby="tc-story-title">
        {storyPhoto ? <Reveal className="tc-spread__media"><img src={storyPhoto} alt="" aria-hidden="true" loading="lazy" data-mo="tilt" /></Reveal> : null}
        <Reveal className="tc-spread__copy" delay={120}>
          <p className="tc-kicker">{store.name}</p>
          <h2 id="tc-story-title" className="tc-h2">{copy.storyTitle}</h2>
          <p>{copy.storyBody}</p>
          <ul className="tc-checks">{copy.values.map(value => <li key={value.title}><IconCheck /> {value.title}</li>)}</ul>
        </Reveal>
      </section>

      {sections.map((section, index) => <Spread key={section.id} section={section} index={index} whatsapp={whatsapp} photo={photoAt(index)} />)}

      {/* Owner 2026-10-27: the store's own working module, chosen by the API for its business. */}
      <StoreModule photo={photoAt(sections.length)} />

      <section id="resenas" className="tc-section tc-reviews" data-pagosya-reviews-section aria-labelledby="tc-reviews-title">
        <h2 id="tc-reviews-title" className="tc-h2">Opiniones de clientes</h2>
        <div className="es-reviews__list" data-pagosya-reviews />
      </section>

      <FeatureSlot at="closing" />

      <section id="cierre" className="tc-closing" data-tc-closing={variant('closing', 'dark')} data-mo="rise" aria-labelledby="tc-closing-title">
        <h2 id="tc-closing-title" className="tc-closing__title">{copy.closingLine}</h2>
        <div className="tc-actions">
          <a className="es-btn es-btn--accent" href="productos.html">{copy.closingCta} <IconArrowRight /></a>
          {whatsapp ? <a className="es-btn es-btn--ghost tc-ghost" href={whatsapp}><IconMessageCircle /> Asesoría por WhatsApp</a> : null}
        </div>
      </section>
    </main>
  </Shell>;
}

// Below the home on purpose: YAPI reads the file's first <section> as «la sección principal», which must be the stage.
type Section = { id: string; title: string; items: Array<{ title: string; text: string }> };

/** The business sections as photo | text spreads, the side alternating; specs and sizes read as a table. */
function Spread({ section, index, whatsapp, photo }: { section: Section; index: number; whatsapp: string; photo?: string }) {
  const { id, title, items } = section;
  if (id === 'gallery') return null;
  return <section id={id} className={photo ? 'tc-spread' : 'tc-spread tc-spread--text'} data-tc-side={index % 2 ? 'right' : 'left'} data-tc-section={id} data-mo="rise" aria-labelledby={`tc-${id}-title`}>
    {photo ? <Reveal className="tc-spread__media"><img src={photo} alt="" aria-hidden="true" loading="lazy" data-mo="tilt" /></Reveal> : null}
    <Reveal className="tc-spread__copy" delay={120}>
      <h2 id={`tc-${id}-title`} className="tc-h2">{title}</h2>
      {id === 'process' || id === 'howto' ? <ol className="tc-steps">{items.map((item, n) => <li key={n}><span>{String(n + 1).padStart(2, '0')}</span><div><h3 className="es-h3">{item.title}</h3><p>{item.text}</p></div></li>)}</ol>
        : id === 'faq' ? <div className="tc-faq">{items.map((item, n) => <details key={n}><summary>{item.title}</summary><p>{item.text}</p></details>)}</div>
        : id === 'sizes' || id === 'materials' ? <table className="tc-table"><tbody>{items.map((item, n) => <tr key={n}><th scope="row">{item.title}</th><td>{item.text}</td></tr>)}</tbody></table>
        : id === 'visit' ? <div className="tc-visit"><dl>{items.map((item, n) => <div key={n}><dt>{item.title}</dt><dd>{item.text}</dd></div>)}</dl>{whatsapp ? <a className="es-btn es-btn--accent" href={whatsapp}><IconMessageCircle /> Escríbenos</a> : null}</div>
        : id === 'quotes' ? <div className="tc-quotes">{items.map((item, n) => <blockquote key={n}><p>«{item.text}»</p><cite>{item.title}</cite></blockquote>)}</div>
        : id === 'blog' ? <div className="es-biz__blog" data-pagosya-blog />
        : <ul className="tc-list">{items.map((item, n) => <li key={n}><IconCheck /><div><h3 className="es-h3">{item.title}</h3><p>{item.text}</p></div></li>)}</ul>}
    </Reveal>
  </section>;
}
