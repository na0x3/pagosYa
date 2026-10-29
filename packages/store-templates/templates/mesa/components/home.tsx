import { useEffect, useState } from 'react';
import { Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { copy, look, photos, sections, store } from './store-data';
import { variant } from './Shell';
import { FeatureSlot } from './features';
import { StoreModule } from './modules';
import { EffectLayer } from './effects';
import { MotionKit, Words } from './motion';
import { IconArrowRight, IconMapPin, IconMessageCircle, IconPlus, IconStar } from './icons';

/** Owner 2026-10-27 («skeletons for food… for hardware… for electronics»): Mesa is the food skeleton — cafés, restaurants,
 *  bakeries. Order first: a warm split cover with the order buttons, the menu as a list with photos and prices (by category), the
 *  place and how to get it, then the house's sections as photo | text spreads. Same store-data as Esencial, so the same fill writes it. */

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
  // Owner 2026-10-27 («Dulce Horno and BAEK are exactly the same… copy-paste with other photos»): each part has real
  // alternatives the dice pick per store, avoiding the last stores' rolls — the cover, the menu, the story and the closing.
  const hero = ['split-left', 'poster', 'stack'].includes(variant('hero', 'split-left')) ? variant('hero', 'split-left') : 'split-left';
  const menu = ['list', 'grid3', 'strip'].includes(variant('grid', 'list')) ? variant('grid', 'list') : 'list';
  const story = ['split', 'overlay', 'pair'].includes(variant('story', 'split')) ? variant('story', 'split') : 'split';
  const closingPhoto = unique([photos.p4, photos.p3, photos.p2]).find(src => !samePhoto(src, photos.hero) && !samePhoto(src, storyPhoto));
  const closing = variant('closing', 'accent') === 'photo' && closingPhoto ? 'photo' : variant('closing', 'accent') === 'newsletter' ? 'note' : 'band';
  // Owner 2026-10-28 («the pictures are at same position even though different stores»): the cover's frame comes from the brand —
  // a cut-out product on a plain ground floats in a blob, a poster typeface gets a tilted card, a tall scene an arch.
  const fonts = String((look as { fonts?: string }).fonts ?? '');
  const frame = variant('heroPlain', 'scene') === 'plain' ? 'round' : ['poster', 'condensed'].includes(fonts) ? 'tilt'
    : variant('heroShape', 'square') === 'tall' ? 'soft' : 'sharp';
  const pairPhoto = story === 'pair' ? unique([photos.p1, photos.p2, photos.p3]).find(src => !samePhoto(src, photos.hero) && !samePhoto(src, storyPhoto)) : undefined;
  return <Shell>
    <main id="contenido" className="ms-home">
      <MotionKit />
      <section id="inicio" className="ms-cover" data-ms-hero={hero} data-ms-frame={frame} data-ms-side={variant('heroFocus', 'cc').endsWith('r') ? 'photo-left' : 'photo-right'} aria-labelledby="ms-hero-title">
        <div className="ms-cover__copy">
          {copy.eyebrow ? <p className="ms-kicker">{copy.eyebrow}</p> : null}
          <h1 id="ms-hero-title" className="ms-cover__title"><Words text={copy.headline} /></h1>
          {copy.subcopy ? <p className="ms-cover__sub">{copy.subcopy}</p> : null}
          <div className="ms-actions">
            <a className="es-btn es-btn--accent" href="#menu">{copy.primaryCta}</a>
            {whatsapp ? <a className="es-btn es-btn--ghost" href={whatsapp}><IconMessageCircle /> Pedir por WhatsApp</a>
              : copy.secondaryCta ? <a className="es-btn es-btn--ghost" href="#historia">{copy.secondaryCta}</a> : null}
          </div>
          <ul className="ms-cover__facts">{copy.values.slice(0, 3).map(value => <li key={value.title}><IconStar /> {value.title}</li>)}</ul>
        </div>
        <EffectLayer />
        <div className="ms-cover__media" data-mo="parallax" data-mo-speed="0.05">
          {photos.heroVideo ? <video src={photos.heroVideo} autoPlay muted loop playsInline poster={photos.hero} aria-hidden="true" />
            : photos.hero ? <img src={photos.hero} alt="" aria-hidden="true" data-mo="tilt" /> : null}
          {store.city ? <p className="ms-cover__place"><IconMapPin /> {store.city}</p> : null}
        </div>
      </section>

      {/* Owner 2026-10-27 («bakeries… really animated»): a moving band of the house's promises. Its own switch (announce: ticker), so
          «quita la cinta» or new words for it are an ordinary edit, not a rewrite. */}
      {variant('announce', 'plain') === 'ticker' && copy.values.length ? <div className="ms-ticker" aria-hidden="true">
        <p className="ms-ticker__track">{[0, 1].map(round => <span key={round}>{[0, 1, 2].flatMap(n => copy.values.map(value => <span key={`${n}-${value.title}`}>{value.title}<i>✦</i></span>))}</span>)}</p>
      </div> : null}

      <section id="menu" className="ms-menu" data-ms-menu={menu} data-mo="rise" aria-labelledby="ms-menu-title">
        <div className="ms-menu__head">
          <p className="ms-kicker">Para hoy</p>
          <h2 id="ms-menu-title" className="ms-h2">{copy.productsTitle}</h2>
          <a className="es-link" href="productos.html">Ver todo <IconArrowRight /></a>
        </div>
        <div className="ms-menu__cats" data-pagosya-categories hidden />
        {cards === 'fashion' ? null : <template data-pagosya-product-template>
          <article className="es-card ms-item" data-es-card="plain">
            <a className="es-card__media ms-item__photo" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="ms-item__info">
              <p className="es-card__eyebrow" data-product-field="eyebrow" hidden />
              <div className="ms-item__line"><h3 className="es-card__name" data-product-field="name">Producto</h3><span className="ms-item__dots" aria-hidden="true" /><p className="es-card__price" data-product-field="price" /></div>
              <ul className="es-card__points" data-product-field="points" hidden />
              <p className="es-card__deal" data-product-field="deal" hidden />
            </div>
            <button type="button" className="ms-item__add" data-product-add aria-label="Agregar al pedido"><IconPlus /></button>
          </article>
        </template>}
        <div className="es-grid ms-menu__list" data-es-grid="list" data-es-cards={cards} data-pagosya-catalog data-mo-cards />
      </section>

      <FeatureSlot at="products" />

      <section id="historia" className={storyPhoto ? 'ms-spread' : 'ms-spread ms-spread--text'} data-ms-story={storyPhoto ? story : 'split'} data-mo="rise" aria-labelledby="ms-story-title">
        {storyPhoto ? <Reveal className="ms-spread__media"><img src={storyPhoto} alt="" aria-hidden="true" loading="lazy" data-mo="tilt" />{pairPhoto ? <img className="ms-spread__second" src={pairPhoto} alt="" aria-hidden="true" loading="lazy" /> : null}</Reveal> : null}
        <Reveal className="ms-spread__copy" delay={120}>
          <p className="ms-kicker">La casa</p>
          <h2 id="ms-story-title" className="ms-h2">{copy.storyTitle}</h2>
          <p>{copy.storyBody}</p>
        </Reveal>
      </section>

      {sections.map((section, index) => <Spread key={section.id} section={section} index={index} whatsapp={whatsapp} photo={photoAt(index)} />)}

      {/* Owner 2026-10-27: the store's own working module, chosen by the API for its business. */}
      <StoreModule photo={photoAt(sections.length)} />

      <section id="resenas" className="ms-section ms-reviews" data-pagosya-reviews-section aria-labelledby="ms-reviews-title">
        <h2 id="ms-reviews-title" className="ms-h2">Lo que dicen de nosotros</h2>
        <div className="es-reviews__list" data-pagosya-reviews />
      </section>

      <FeatureSlot at="closing" />

      <section id="cierre" className="ms-closing" data-ms-closing={closing} data-mo="rise" aria-labelledby="ms-closing-title">
        {closing === 'photo' ? <img className="ms-closing__photo" src={closingPhoto} alt="" aria-hidden="true" loading="lazy" /> : null}
        <EffectLayer />
        <h2 id="ms-closing-title" className="ms-closing__title">{copy.closingLine}</h2>
        <div className="ms-actions">
          <a className="es-btn es-btn--light" href="#menu">{copy.closingCta}</a>
          {whatsapp ? <a className="es-btn es-btn--ghost ms-closing__ghost" href={whatsapp}><IconMessageCircle /> WhatsApp</a> : null}
        </div>
      </section>
    </main>
  </Shell>;
}

// Below the home on purpose: YAPI reads the file's first <section> as «la sección principal», which must be the cover.
type Section = { id: string; title: string; items: Array<{ title: string; text: string }> };

/** The business sections as photo | text spreads, the side alternating; the visit section leads with the place. */
function Spread({ section, index, whatsapp, photo }: { section: Section; index: number; whatsapp: string; photo?: string }) {
  const { id, title, items } = section;
  if (id === 'gallery') return null;
  return <section id={id} className={photo ? 'ms-spread' : 'ms-spread ms-spread--text'} data-ms-side={index % 2 ? 'left' : 'right'} data-ms-section={id} data-mo="rise" aria-labelledby={`ms-${id}-title`}>
    {photo ? <Reveal className="ms-spread__media"><img src={photo} alt="" aria-hidden="true" loading="lazy" data-mo="tilt" /></Reveal> : null}
    <Reveal className="ms-spread__copy" delay={120}>
      <h2 id={`ms-${id}-title`} className="ms-h2">{title}</h2>
      {id === 'process' || id === 'howto' ? <ol className="ms-steps">{items.map((item, n) => <li key={n} data-mo-item><span>{n + 1}</span><div><h3 className="es-h3">{item.title}</h3><p>{item.text}</p></div></li>)}</ol>
        : id === 'faq' ? <div className="ms-faq">{items.map((item, n) => <details key={n}><summary>{item.title}</summary><p>{item.text}</p></details>)}</div>
        : id === 'visit' ? <div className="ms-visit">{store.city ? <p className="ms-visit__city"><IconMapPin /> {store.city}</p> : null}<dl>{items.map((item, n) => <div key={n}><dt>{item.title}</dt><dd>{item.text}</dd></div>)}</dl>{whatsapp ? <a className="es-btn es-btn--accent" href={whatsapp}><IconMessageCircle /> Escríbenos</a> : null}</div>
        : id === 'sizes' ? <table className="es-biz__table"><tbody>{items.map((item, n) => <tr key={n}><th scope="row">{item.title}</th><td>{item.text}</td></tr>)}</tbody></table>
        : id === 'quotes' ? <div className="ms-quotes">{items.map((item, n) => <blockquote key={n}><p>«{item.text}»</p><cite>{item.title}</cite></blockquote>)}</div>
        : id === 'blog' ? <div className="es-biz__blog" data-pagosya-blog />
        : <ul className="ms-list">{items.map((item, n) => <li key={n}><h3 className="es-h3">{item.title}</h3><p>{item.text}</p></li>)}</ul>}
    </Reveal>
  </section>;
}
