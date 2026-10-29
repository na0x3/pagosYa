import { useEffect, useState } from 'react';
import { Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { copy, photos, sections, store } from './store-data';
import { variant } from './Shell';
import { FeatureSlot } from './features';
import { StoreModule } from './modules';
import { MotionKit, Words } from './motion';
import { IconArrowRight, IconCheck, IconMessageCircle, IconPlus, IconRefreshCcw, IconShieldCheck, IconStar, IconTruck } from './icons';

/** Owner 2026-10-27 («every few stores have the same skeleton»): Catálogo is a skeleton of its own, not an Esencial variant — the
 *  shop comes first. A short banner, a trust strip, the categories as chips over the whole catalogue with sort and filters right on
 *  the home, then the business's own sections. It reads the same store-data as Esencial, so the same fill writes it. */

const TRUST_ICONS = [IconTruck, IconShieldCheck, IconRefreshCcw, IconStar];

/** Owner 2026-10-28 (avril, «longer with more pictures»): the sections' photos, each once — the merchant's own pictures first
 *  (photos.b1…b6), then the spare product photos, then each product's second photo (its first is already on its card). */
function useSectionPhotos(taken: Array<string | undefined>): string[] {
  const [products, setProducts] = useState<string[]>([]);
  useEffect(() => {
    const items = ((window as unknown as { PAGOSYA_CONFIG?: { data?: { items?: Array<{ imageUrls?: string[] }> } } }).PAGOSYA_CONFIG?.data?.items) ?? [];
    setProducts(unique([...items.map(item => item.imageUrls?.[1]), ...items.map(item => item.imageUrls?.[0])]));
  }, []);
  const skip = new Set(taken.filter((src): src is string => Boolean(src)).map(photoKey));
  // Product photos last: their first photo is already on the product's card (avril 2026-10-28 showed the tote twice).
  const own = [photos.b1, photos.b2, photos.b3, photos.b4, photos.b5, photos.b6, photos.story];
  return unique([...own, ...products, photos.p1, photos.p2, photos.p3, photos.p4]).filter(src => !skip.has(photoKey(src)));
}

/** Each photo once: merchants often use the same upload for the story and a product. */
/** One file can be spelled «assets/x.jpg», «/assets/x.jpg» or a full URL (eval 2026-10-28: NOA's hero came back three times), so a
 *  photo is known by its file name. */
const photoKey = (src: string) => src.split(/[?#]/)[0].split('/').pop() || src;
const samePhoto = (a: string | undefined, b: string | undefined) => Boolean(a && b && photoKey(a) === photoKey(b));
const unique = (list: Array<string | undefined>) => { const seen = new Set<string>(); return list.filter((src): src is string => Boolean(src) && !seen.has(photoKey(src!)) && Boolean(seen.add(photoKey(src!)))); };

export default function Home() {
  const cards = variant('cards', 'compact');
  const card = cards === 'compact' ? variant('card', 'plain') : 'plain';
  // The banner: the hero photo with the words; a side tile too when the store has a photo the banner does not show.
  const side = unique([photos.p1, photos.p2, photos.story]).find(src => !samePhoto(src, photos.hero));
  // Owner 2026-10-27 («never the same»): the banner, the grid and the closing vary per store (the starter dice), past the last stores.
  const rolledHero = ['split-left', 'full', 'type'].includes(variant('hero', 'split-left')) ? variant('hero', 'split-left') : 'split-left';
  const banner = rolledHero === 'full' ? 'full' : rolledHero === 'type' ? 'type' : side ? 'split' : 'single';
  const columns = variant('grid', 'grid4') === 'grid3' ? 'grid3' : 'grid4';
  const phone: string = store.phone;
  const storyPhoto = unique([photos.story, photos.p2, photos.p3]).find(src => !samePhoto(src, photos.hero) && src !== side);
  const spare = useSectionPhotos([photos.hero, side, storyPhoto]);
  // One photo per block down the page, never twice; a block past the last photo is laid out for words.
  const campaignPhoto = spare[0];
  const photoAt = (index: number) => spare[index + 1];
  return <Shell>
    <main id="contenido" className="ct-home" data-ct-banner={banner}>
      <MotionKit />
      <section id="inicio" className="ct-banner" aria-labelledby="ct-hero-title">
        <div className="ct-banner__main">
          {photos.heroVideo ? <video className="ct-banner__photo" src={photos.heroVideo} autoPlay muted loop playsInline poster={photos.hero} aria-hidden="true" />
            : photos.hero ? <img className="ct-banner__photo" src={photos.hero} alt="" aria-hidden="true" /> : null}
          <div className="ct-banner__copy">
            {copy.eyebrow ? <p className="es-eyebrow">{copy.eyebrow}</p> : null}
            <h1 id="ct-hero-title" className="ct-banner__title"><Words text={copy.headline} /></h1>
            {copy.subcopy ? <p className="ct-banner__sub">{copy.subcopy}</p> : null}
            <a className="es-btn es-btn--accent" href="#productos">{copy.primaryCta}</a>
          </div>
        </div>
        {banner === 'split' && side ? <a className="ct-banner__side" href="productos.html">
          <img src={side} alt="" aria-hidden="true" />
          <span className="ct-banner__side-label">{copy.secondaryCta || 'Ver todo'} <IconArrowRight /></span>
        </a> : null}
      </section>

      <section id="valores" className="ct-trust" data-mo="rise" aria-label="Por qué comprar aquí">
        <ul>{copy.values.slice(0, 4).map((value, index) => { const Icon = TRUST_ICONS[index % TRUST_ICONS.length]; return <li key={value.title} data-mo-item>
          <Icon className="ct-trust__icon" /><div><p className="ct-trust__title">{value.title}</p><p className="ct-trust__text">{value.text}</p></div>
        </li>; })}</ul>
      </section>

      <section id="productos" className="ct-shop" data-mo="rise" aria-labelledby="ct-products-title">
        <div className="ct-shop__head">
          <h2 id="ct-products-title" className="ct-h2">{copy.productsTitle}</h2>
          <a className="es-link" href="productos.html">Ver todo <IconArrowRight /></a>
        </div>
        <div className="ct-shop__cats" data-pagosya-categories hidden />
        {cards === 'fashion' ? null : <template data-pagosya-product-template>
          <article className="es-card ct-card" data-es-card={card}>
            <a className="es-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <p className="es-card__eyebrow" data-product-field="eyebrow" hidden />
            <h3 className="es-card__name" data-product-field="name">Producto</h3>
            <p className="es-card__chips" data-product-field="chips" hidden />
            <p className="es-card__deal" data-product-field="deal" hidden />
            <div className="es-card__row">
              <p className="es-card__price" data-product-field="price" />
              <span className="es-card__save" data-product-field="save" hidden />
            </div>
            <button type="button" className="ct-card__add" data-product-add><IconPlus /> Agregar</button>
          </article>
        </template>}
        <div className="es-grid ct-grid" data-es-grid={columns} data-ct-columns={columns} data-es-cards={cards} data-pagosya-catalog data-pagosya-filters data-mo-cards />
      </section>

      <FeatureSlot at="products" />

      {campaignPhoto ? <section className="ct-campaign" data-mo="rise" aria-label={store.name}>
        <img className="ct-campaign__photo" src={campaignPhoto} alt="" aria-hidden="true" loading="lazy" />
        <div className="ct-campaign__caption">
          <p className="ct-campaign__line">{store.tagline || copy.eyebrow || copy.headline}</p>
          <a className="es-btn es-btn--ghost" href="productos.html">{copy.secondaryCta || 'Ver todo'} <IconArrowRight /></a>
        </div>
      </section> : null}

      <section id="historia" className="ct-about" data-mo="rise" aria-labelledby="ct-story-title">
        {storyPhoto ? <img className="ct-about__photo" src={storyPhoto} alt="" aria-hidden="true" loading="lazy" data-mo="tilt" /> : null}
        <Reveal className="ct-about__copy">
          <h2 id="ct-story-title" className="ct-h2">{copy.storyTitle}</h2>
          <p>{copy.storyBody}</p>
          {phone ? <a className="es-btn es-btn--ghost" href={`https://wa.me/${phone.replace(/\D/g, '')}`}><IconMessageCircle /> Escríbenos</a> : null}
        </Reveal>
      </section>

      {sections.map((section, index) => <BusinessSection key={section.id} section={section} phone={phone} photo={photoAt(index)} side={index % 2 ? 'right' : 'left'} />)}

      {/* Owner 2026-10-27: the store's own working module, chosen by the API for its business. */}
      <StoreModule photo={photoAt(sections.length)} />

      <section id="resenas" className="ct-section ct-reviews" data-pagosya-reviews-section aria-labelledby="ct-reviews-title">
        <h2 id="ct-reviews-title" className="ct-h2">Lo que dicen nuestros clientes</h2>
        <div className="es-reviews__list" data-pagosya-reviews />
      </section>

      <FeatureSlot at="closing" />

      <section id="cierre" className="ct-closing" data-ct-closing={variant('closing', 'accent')} data-mo="rise" aria-labelledby="ct-closing-title">
        <h2 id="ct-closing-title" className="ct-closing__title">{copy.closingLine}</h2>
        <a className="es-btn es-btn--accent" href="productos.html">{copy.closingCta} <IconArrowRight /></a>
      </section>
    </main>
  </Shell>;
}

// Below the home on purpose: YAPI reads the file's first <section> as «la sección principal», which must be the banner.
type Section = { id: string; title: string; items: Array<{ title: string; text: string }> };

/** The business sections the fill wrote, in Catálogo's plain shop look: steps, a table, questions, notes or a list. */
function BusinessSection({ section, phone, photo, side }: { section: Section; phone: string; photo?: string; side: 'left' | 'right' }) {
  const { id, title, items } = section;
  // Catálogo shows products, not photo walls (owner 2026-10-15: no photo groups unless asked): a gallery becomes nothing here.
  if (id === 'gallery') return null;
  // Photo | words, then words | photo down the page (owner 2026-10-28: avril's sections were text boxes).
  const framed = Boolean(photo) && id !== 'blog';
  return <section id={id} className={framed ? 'ct-section ct-biz ct-biz--photo' : 'ct-section ct-biz'} data-ct-section={id} data-ct-side={side} data-mo="rise" aria-labelledby={`ct-${id}-title`}>
    {framed ? <Reveal className="ct-biz__media"><img src={photo} alt="" aria-hidden="true" loading="lazy" /></Reveal> : null}
    <div className="ct-biz__body">
    <h2 id={`ct-${id}-title`} className="ct-h2">{title}</h2>
    {id === 'process' || id === 'howto' ? <ol className="ct-biz__steps">{items.map((item, index) => <li key={index}><span>{index + 1}</span><div><h3 className="es-h3">{item.title}</h3><p>{item.text}</p></div></li>)}</ol>
      : id === 'sizes' ? <table className="es-biz__table"><tbody>{items.map((item, index) => <tr key={index}><th scope="row">{item.title}</th><td>{item.text}</td></tr>)}</tbody></table>
      : id === 'faq' ? <div className="ct-biz__faq">{items.map((item, index) => <details key={index}><summary>{item.title}</summary><p>{item.text}</p></details>)}</div>
      : id === 'visit' ? <div className="ct-biz__visit">{store.city ? <p className="ct-biz__city">{store.city}</p> : null}<dl>{items.map((item, index) => <div key={index}><dt>{item.title}</dt><dd>{item.text}</dd></div>)}</dl>{phone ? <a className="es-btn es-btn--accent" href={`https://wa.me/${phone.replace(/\D/g, '')}`}><IconMessageCircle /> WhatsApp</a> : null}</div>
      : id === 'blog' ? <div className="es-biz__blog" data-pagosya-blog />
      : id === 'quotes' ? <div className="ct-biz__quotes">{items.map((item, index) => <blockquote key={index}><p>{item.text}</p><cite>{item.title}</cite></blockquote>)}</div>
      : <ul className="ct-biz__cards">{items.map((item, index) => <li key={index}>{id === 'materials' || id === 'pick' ? <IconCheck className="ct-biz__icon" /> : <span className="ct-biz__n">{String(index + 1).padStart(2, '0')}</span>}<h3 className="es-h3">{item.title}</h3><p>{item.text}</p></li>)}</ul>}
    </div>
  </section>;
}
