import { useEffect, useState } from 'react';
import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { copy, photos, sections, store } from './store-data';
import { variant } from './Shell';
import { FeatureSlot } from './features';
import { IconArrowRight, IconArrowUpRight, IconMessageCircle } from './icons';
import { StoreModule } from './modules';
import { MotionKit, Words } from './motion';

/** Owner 2026-10-27 («do an atelier one»): Atelier is a skeleton of its own, drawn from the NOA VARGAS store the owner approved —
 *  a fashion-house page: a tall cover, the house's statement, the collection as an editorial grid (one piece large), the story with a
 *  drop cap, the business sections as magazine spreads, a closing photo band. Same store-data as Esencial, so the same fill writes it. */

/** Each photo once: merchants often use the same upload for the story and a product. */
/** One file can be spelled «assets/x.jpg», «/assets/x.jpg» or a full URL (eval 2026-10-28: NOA's hero came back three times), so a
 *  photo is known by its file name. */
const photoKey = (src: string) => src.split(/[?#]/)[0].split('/').pop() || src;
const samePhoto = (a: string | undefined, b: string | undefined) => Boolean(a && b && photoKey(a) === photoKey(b));
const unique = (list: Array<string | undefined>) => { const seen = new Set<string>(); return list.filter((src): src is string => Boolean(src) && !seen.has(photoKey(src!)) && Boolean(seen.add(photoKey(src!)))); };

/** Owner 2026-10-27 («much text all alone… like picture | text or text | picture»): every spread carries a photo. The store's own
 *  spare photos go first, then each product's second photo (its first is already on its card), so a photo is not shown twice. */
function useSpreadPhotos(own: string[], taken: Array<string | undefined>): string[] {
  const [products, setProducts] = useState<string[]>([]);
  useEffect(() => {
    const items = ((window as unknown as { PAGOSYA_CONFIG?: { data?: { items?: Array<{ imageUrls?: string[] }> } } }).PAGOSYA_CONFIG?.data?.items) ?? [];
    // Second photos first; a product's card photo only as the last resort, so a section past the merchant's photos still has one
    // (owner 2026-10-28: «more pictures»; the check counts repeats on the page, not a card's own photo).
    setProducts(unique([...items.map(item => item.imageUrls?.[1]), ...items.map(item => item.imageUrls?.[0])]));
  }, []);
  const skip = new Set(taken.filter((src): src is string => Boolean(src)).map(photoKey));
  return unique([...own, ...products]).filter(src => !skip.has(photoKey(src)));
}

export default function Home() {
  const cards = variant('cards', 'compact');
  const coverPhotos = unique([photos.hero, photos.p1, photos.p2]).slice(0, 3);
  const fade = variant('heroFade', 'still') === 'fade' && !photos.heroVideo && coverPhotos.length > 1;
  const storyPhoto = unique([photos.story, photos.p1, photos.p2]).find(src => !samePhoto(src, photos.hero));
  const closingPhoto = unique([photos.p4, photos.p3, photos.p2, photos.p1]).find(src => !samePhoto(src, photos.hero) && !samePhoto(src, storyPhoto));
  const statement = copy.subcopy || copy.storyBody.split(/(?<=[.!?])\s+/)[0] || '';
  const spreadPhotos = useSpreadPhotos(unique([photos.b1, photos.b2, photos.b3, photos.b4, photos.b5, photos.b6, photos.p1, photos.p2, photos.p3, photos.p4, photos.story]), [photos.hero, ...(fade ? coverPhotos : []), storyPhoto, closingPhoto]);
  // Each photo once (owner 2026-10-28: ZARA's sections repeated the same pictures); a spread past the last photo is words only.
  const photoAt = (index: number) => spreadPhotos[index];
  const phone: string = store.phone;
  const year = new Date().getFullYear();
  // Owner 2026-10-27 («never the same»): the cover, the collection and the closing vary per store (the starter dice).
  const cover = ['full', 'split-right', 'framed'].includes(variant('hero', 'full')) ? variant('hero', 'full') : 'full';
  const collection = ['grid3', 'grid4', 'strip'].includes(variant('grid', 'grid3')) ? variant('grid', 'grid3') : 'grid3';
  return <Shell>
    <main id="contenido" className="at-home">
      <MotionKit />
      <section id="inicio" className="at-cover" data-at-hero={cover} aria-labelledby="at-hero-title">
        {cover === 'framed' ? <p className="at-cover__masthead" aria-hidden="true">{store.name}</p> : null}
        <Parallax className="at-cover__media" strength={50} mobileStrength={12}>
          {photos.heroVideo ? <video className="at-cover__photo" src={photos.heroVideo} autoPlay muted loop playsInline poster={photos.hero} aria-hidden="true" />
            : fade ? <CoverFade list={coverPhotos} /> : photos.hero ? <img className="at-cover__photo" src={photos.hero} alt="" aria-hidden="true" /> : null}
        </Parallax>
        <div className="at-cover__copy">
          <p className="at-cover__kicker">{copy.eyebrow || `Colección ${year}`}</p>
          <h1 id="at-hero-title" className="at-cover__title"><Words text={copy.headline} /></h1>
          <div className="at-cover__actions">
            <a className="at-textlink" href="#productos">{copy.primaryCta} <IconArrowRight /></a>
            {copy.secondaryCta ? <a className="at-textlink" href="#historia">{copy.secondaryCta}</a> : null}
          </div>
        </div>
      </section>

      {statement ? <section id="casa" className={photoAt(0) ? 'at-statement at-statement--photo' : 'at-statement'} aria-label={`La casa ${store.name}`}>
        {photoAt(0) ? <img className="at-statement__photo" src={photoAt(0)} alt="" aria-hidden="true" loading="lazy" /> : null}
        <Reveal className="at-statement__copy"><p className="at-kicker">La casa</p><p className="at-statement__text">{statement}</p></Reveal>
      </section> : null}

      <section id="productos" className="at-collection" data-mo="rise" aria-labelledby="at-products-title">
        <Reveal className="at-head">
          <p className="at-kicker">{store.name}</p>
          <h2 id="at-products-title" className="at-h2">{copy.productsTitle}</h2>
          <a className="at-textlink" href="productos.html">Ver toda la colección <IconArrowRight /></a>
        </Reveal>
        {cards === 'fashion' ? null : <template data-pagosya-product-template>
          <article className="es-card at-card" data-es-card="plain">
            <a className="es-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <p className="es-card__eyebrow" data-product-field="eyebrow" hidden />
            <div className="at-card__row">
              <h3 className="es-card__name" data-product-field="name">Producto</h3>
              <p className="es-card__price" data-product-field="price" />
            </div>
            <p className="es-card__deal" data-product-field="deal" hidden />
            <button type="button" className="at-card__add" data-product-add>Agregar a la bolsa</button>
          </article>
        </template>}
        <div className="es-grid at-grid" data-es-grid="grid3" data-at-grid={collection} data-es-cards={cards} data-pagosya-catalog data-mo-cards />
      </section>

      <FeatureSlot at="products" />

      <section id="historia" className={storyPhoto ? 'at-story' : 'at-story at-story--text'} data-mo="rise" aria-labelledby="at-story-title">
        {storyPhoto ? <Reveal className="at-story__media"><img src={storyPhoto} alt="" aria-hidden="true" loading="lazy" data-mo="tilt" /></Reveal> : null}
        <Reveal className="at-story__copy" delay={120}>
          <p className="at-kicker">Nuestra historia</p>
          <h2 id="at-story-title" className="at-h2">{copy.storyTitle}</h2>
          <p className="at-story__body">{copy.storyBody}</p>
          <p className="at-story__sign">— {store.name}</p>
        </Reveal>
      </section>

      <FeatureSlot at="story" />

      {sections.map((section, index) => <Spread key={section.id} section={section} index={index} phone={phone} photo={photoAt(index + 1)} />)}

      {/* Owner 2026-10-27: the store's own working module (measurements, frames, bouquet…), chosen by the API for its business. */}
      <StoreModule photo={photoAt(sections.length + 1)} />

      <section id="valores" className="at-values" data-mo="rise" aria-label="Lo que nos define">
        <ol>{copy.values.map((value, index) => <li key={value.title} data-mo-item><Reveal delay={index * 90}><span className="at-values__n">{['I', 'II', 'III', 'IV'][index] ?? index + 1}</span><h3 className="at-h3">{value.title}</h3><p>{value.text}</p></Reveal></li>)}</ol>
      </section>

      <section id="resenas" className="at-section at-reviews" data-pagosya-reviews-section aria-labelledby="at-reviews-title">
        <h2 id="at-reviews-title" className="at-h2">Lo que dicen nuestras clientas</h2>
        <div className="es-reviews__list" data-pagosya-reviews />
      </section>

      <FeatureSlot at="closing" />

      <section id="cierre" className={closingPhoto && variant('closing', 'photo') === 'photo' ? 'at-closing' : 'at-closing at-closing--plain'} data-at-closing={variant('closing', 'photo')} aria-labelledby="at-closing-title">
        {closingPhoto && variant('closing', 'photo') === 'photo' ? <img className="at-closing__photo" src={closingPhoto} alt="" aria-hidden="true" loading="lazy" /> : null}
        <Reveal className="at-closing__inner">
          <h2 id="at-closing-title" className="at-closing__title">{copy.closingLine}</h2>
          <div className="at-cover__actions">
            <a className="at-textlink" href="productos.html">{copy.closingCta} <IconArrowUpRight /></a>
            {phone ? <a className="at-textlink" href={`https://wa.me/${phone.replace(/\D/g, '')}`}><IconMessageCircle /> {variant('module', 'none') === 'measure' ? 'Reserva una cita' : 'Escríbenos'}</a> : null}
          </div>
        </Reveal>
      </section>
    </main>
  </Shell>;
}

/** The cover's photos pass slowly into one another; visitors who asked for less motion keep the first. */
function CoverFade({ list }: { list: string[] }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.pagosyaMotion === 'off') return;
    const timer = setInterval(() => setActive(index => (index + 1) % list.length), 6500);
    return () => clearInterval(timer);
  }, [list.length]);
  return <div className="at-cover__fade">{list.map((src, index) => <img key={src} className="at-cover__photo" src={src} alt="" aria-hidden="true" data-active={index === active ? '' : undefined} />)}</div>;
}

// Below the home on purpose: YAPI reads the file's first <section> as «la sección principal», which must be the cover.
type Section = { id: string; title: string; items: Array<{ title: string; text: string }> };

/** The business sections the fill wrote, as magazine spreads: a numbered heading on the left, the content on the right. */
function Spread({ section, index, phone, photo }: { section: Section; index: number; phone: string; photo?: string }) {
  const { id, title, items } = section;
  // No photo walls (owner 2026-10-15): the gallery is the collection grid's job here.
  if (id === 'gallery') return null;
  const number = String(index + 1).padStart(2, '0');
  // Photo | text, then text | photo: the side alternates down the page.
  return <section id={id} className={photo ? 'at-section at-spread at-spread--photo' : 'at-section at-spread'} data-at-section={id} data-at-side={index % 2 ? 'right' : 'left'} data-mo="rise" aria-labelledby={`at-${id}-title`}>
    {photo ? <Reveal className="at-spread__media" ><img src={photo} alt="" aria-hidden="true" loading="lazy" data-mo="tilt" /></Reveal> : null}
    <div className="at-spread__main">
    <Reveal className="at-spread__head"><span className="at-spread__n">{number}</span><h2 id={`at-${id}-title`} className="at-h2">{title}</h2></Reveal>
    <div className="at-spread__body">
      {id === 'process' || id === 'howto' ? <ol className="at-steps">{items.map((item, n) => <li key={n}><span>{String(n + 1).padStart(2, '0')}</span><div><h3 className="at-h3">{item.title}</h3><p>{item.text}</p></div></li>)}</ol>
        : id === 'sizes' ? <table className="at-table"><tbody>{items.map((item, n) => <tr key={n}><th scope="row">{item.title}</th><td>{item.text}</td></tr>)}</tbody></table>
        : id === 'faq' ? <div className="at-faq">{items.map((item, n) => <details key={n}><summary>{item.title}</summary><p>{item.text}</p></details>)}</div>
        : id === 'quotes' ? <div className="at-quotes">{items.map((item, n) => <blockquote key={n}><p>«{item.text}»</p><cite>{item.title}</cite></blockquote>)}</div>
        : id === 'manifesto' ? <ol className="at-manifesto">{items.map((item, n) => <li key={n}><span>{item.title}</span><p>{item.text}</p></li>)}</ol>
        : id === 'visit' ? <div className="at-visit">{store.city ? <p className="at-kicker">{store.city}</p> : null}<dl>{items.map((item, n) => <div key={n}><dt>{item.title}</dt><dd>{item.text}</dd></div>)}</dl>{phone ? <a className="at-textlink" href={`https://wa.me/${phone.replace(/\D/g, '')}`}><IconMessageCircle /> Escríbenos por WhatsApp</a> : null}</div>
        : id === 'blog' ? <div className="es-biz__blog" data-pagosya-blog />
        : <ul className="at-notes">{items.map((item, n) => <li key={n}><h3 className="at-h3">{item.title}</h3><p>{item.text}</p></li>)}</ul>}
    </div>
    </div>
  </section>;
}
