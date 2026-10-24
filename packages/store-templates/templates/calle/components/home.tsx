import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { copy, photos, sections, store } from './store-data';
import { variant } from './Shell';
import { FeatureSlot } from './features';
import { IconArrowRight, IconArrowUpRight, IconCheck, IconMessageCircle, IconPlus, IconShieldCheck, IconStar, IconTruck } from './icons';

const VALUE_ICONS = [IconStar, IconTruck, IconShieldCheck];

/** Each photo once: merchants often use the same upload for the story and a product. */
const unique = (list: Array<string | undefined>) => [...new Set(list.filter((src): src is string => Boolean(src)))];

type Section = { id: string; title: string; items: Array<{ title: string; text: string }> };

/** Variety spec §2: the business sections the fill call wrote (at most two), each from the merchant's own facts. */
function BusinessSection({ section, phone, band }: { section: Section; phone: string; band?: string }) {
  const { id, title, items } = section;
  const gallery = unique([photos.p1, photos.p2, photos.p3, photos.p4, photos.story]).filter(src => src !== photos.hero).slice(0, 4);
  const pickPhoto = unique([photos.p1, photos.p2, photos.p3]).find(src => src !== photos.story && src !== photos.hero) ?? photos.p1;
  // The journal's lead note carries one photo the hero, story and pair story do not already show; the other notes are words only.
  const notePhoto = unique([photos.p3, photos.p2]).find(src => src !== photos.story && src !== photos.hero && src !== photos.p1);
  if (id === 'gallery' && gallery.length < 2) return null;
  // Manifesto (owner 2026-10-21: bare centered lines read as plain text): a photo beside the lines on a tinted band.
  if (id === 'manifesto') {
    const statementPhoto = unique([photos.p2, photos.p4, photos.p1]).find(src => src !== photos.hero && src !== photos.story && src !== notePhoto);
    return <section id={id} className="es-section es-biz" data-es-section={id} data-es-band={band ?? 'muted'} aria-labelledby={`es-${id}-title`}>
      <div className={statementPhoto ? 'es-biz__statement' : 'es-biz__statement es-biz__statement--text'}>
        {statementPhoto ? <img className="es-biz__statement-photo" src={statementPhoto} alt="" aria-hidden="true" loading="lazy" /> : null}
        <Reveal className="es-biz__statement-copy">
          <h2 id={`es-${id}-title`} className="es-h2">{title}</h2>
          <ol className="es-biz__manifesto">{items.map((item, index) => <li key={index}><span>{item.title}</span><p>{item.text}</p></li>)}</ol>
        </Reveal>
      </div>
    </section>;
  }
  return <section id={id} className="es-section es-biz" data-es-section={id} data-es-band={band} aria-labelledby={`es-${id}-title`}>
    <Reveal className="es-biz__head">{id === 'journal' ? <p className="es-eyebrow">Diario</p> : null}<h2 id={`es-${id}-title`} className="es-h2">{title}</h2></Reveal>
    {id === 'process' || id === 'howto' ? <ol className="es-biz__steps">{items.map((item, index) => <li key={index}><span className="es-biz__n">{String(index + 1).padStart(2, '0')}</span><h3 className="es-h3">{item.title}</h3><p>{item.text}</p></li>)}</ol>
      : id === 'sizes' ? <table className="es-biz__table"><tbody>{items.map((item, index) => <tr key={index}><th scope="row">{item.title}</th><td>{item.text}</td></tr>)}</tbody></table>
      : id === 'faq' ? <div className="es-biz__faq">{items.map((item, index) => <details key={index}><summary>{item.title}</summary><p>{item.text}</p></details>)}</div>
      : id === 'gallery' ? <div className="es-biz__gallery">{gallery.map(src => <img key={src} src={src} alt="" aria-hidden="true" loading="lazy" />)}</div>
      : id === 'pick' ? <div className="es-biz__pick">{pickPhoto ? <img src={pickPhoto} alt="" aria-hidden="true" loading="lazy" /> : null}<div>{items.map((item, index) => <div key={index}><h3 className="es-h3">{item.title}</h3><p>{item.text}</p></div>)}<a className="es-btn es-btn--accent" href="productos.html">{copy.primaryCta}</a></div></div>
      : id === 'visit' ? <div className="es-biz__visit">{store.city ? <p className="es-biz__city">{store.city}</p> : null}<dl>{items.map((item, index) => <div key={index}><dt>{item.title}</dt><dd>{item.text}</dd></div>)}</dl>{phone ? <a className="es-btn es-btn--accent" href={`https://wa.me/${phone.replace(/\D/g, '')}`}><IconMessageCircle /> WhatsApp</a> : null}</div>
      : id === 'journal' ? <div className="es-biz__journal">
        {notePhoto ? <img className="es-biz__note-photo" src={notePhoto} alt="" aria-hidden="true" loading="lazy" /> : null}
        <ol className="es-biz__notes">{items.map((item, index) => <li key={index}><p className="es-biz__kicker">Nota {String(index + 1).padStart(2, '0')}</p><h3 className="es-h3">{item.title}</h3><p>{item.text}</p></li>)}</ol>
      </div>
      : id === 'quotes' ?<div className="es-biz__quotes">{items.map((item, index) => <blockquote key={index}><p>{item.text}</p><cite>{item.title}</cite></blockquote>)}</div>
      : <ul className="es-biz__list">{items.map((item, index) => <li key={index}>{id === 'materials' ? <IconCheck className="es-biz__icon" /> : null}<div><h3 className="es-h3">{item.title}</h3><p>{item.text}</p></div></li>)}</ul>}
  </section>;
}

export default function Home() {
  // Variety spec §2: the rolled hero; photo-led variants fall back to the type hero when the photos are missing.
  const rolled = variant('hero', 'full');
  const heroPhotos = unique([photos.hero, photos.p1, photos.p2, photos.p3]);
  const multi = rolled === 'collage' || rolled === 'strip';
  const hero = !photos.hero || (multi && heroPhotos.length < 3) ? 'type' : rolled;
  const layered = hero === 'full' || hero === 'poster';
  // Showcase commerce: the card design (showcase | compact | split); the older card looks apply to compact cards only.
  const cards = variant('cards', 'compact');
  const card = cards === 'compact' ? variant('card', 'plain') : 'plain';
  const sentences = copy.storyBody.split(/(?<=[.!?])\s+/).map(text => text.trim()).filter(Boolean);
  const rolledStory = variant('story', 'split');
  const story = ['split', 'overlay', 'pair'].includes(rolledStory) && !photos.story ? 'note'
    : rolledStory === 'pair' && (!photos.p1 || photos.p1 === photos.story) ? 'split' : rolledStory === 'timeline' && sentences.length < 2 ? 'note' : rolledStory;
  const values = variant('values', 'numbered');
  const rolledClosing = variant('closing', 'dark');
  const closing = rolledClosing === 'photo' && !photos.hero ? 'dark' : rolledClosing;
  const phone: string = store.phone;
  // Colour bands (2026-10-19): cream-on-cream pages read as wireframes; the sections after the catalog sit on coloured bands.
  const bands = variant('bands', 'alternate');
  // Blocks: story deep, then muted and accent; a band never matches its neighbour (QA: mono's accent is its deep colour,
  // so values in accent ran into the dark closing as one black block).
  const tones = bands === 'blocks'
    ? [story === 'overlay' ? 'paper' : 'deep', 'muted', 'accent', 'paper']
    : bands === 'alternate' ? ['muted', 'paper', 'muted', 'paper'] : [];
  const band = (index: number): string | undefined => tones[index % 4];
  const beforeValues = band(sections.length);
  const valuesTone = bands !== 'blocks' ? band(1 + sections.length)
    : ['photo', 'newsletter'].includes(closing) && beforeValues !== 'accent' ? 'accent' : beforeValues === 'muted' ? 'paper' : 'muted';
  return <Shell>
    <main id="contenido" data-es-bands={bands}>
      <section id="inicio" className={hero === 'type' ? 'es-hero es-hero--plain' : 'es-hero'} data-es-hero={hero} aria-labelledby="es-hero-title">
        {layered ? <Parallax className="es-hero__media" strength={60} mobileStrength={16}><img src={photos.hero} alt="" aria-hidden="true" /></Parallax>
          : hero !== 'type' ? <div className="es-hero__media">{(multi ? heroPhotos.slice(0, 3) : [photos.hero]).map(src => <img key={src} src={src} alt="" aria-hidden="true" />)}</div> : null}
        <div className="es-hero__copy">
          {hero === 'poster' && store.logo ? <img className="es-hero__logo" src={store.logo} alt="" aria-hidden="true" /> : null}
          {copy.eyebrow ? <p className="es-eyebrow">{copy.eyebrow}</p> : null}
          <h1 id="es-hero-title" className="es-display">{copy.headline}</h1>
          {copy.subcopy ? <p className="es-hero__sub">{copy.subcopy}</p> : null}
          <div className="es-actions">
            <a className="es-btn es-btn--accent" href="productos.html">{copy.primaryCta}</a>
            {copy.secondaryCta ? <a className="es-btn es-btn--ghost" href="#historia">{copy.secondaryCta}</a> : null}
          </div>
        </div>
      </section>

      {bands === 'blocks' && copy.values.length ? <div className={hero === 'type' ? 'es-marquee es-marquee--line' : 'es-marquee'} aria-hidden="true">
        <p className="es-marquee__track">{[0, 1].map(round => <span key={round}>{[0, 1, 2].flatMap(copyIndex => copy.values.map(value => <span key={`${copyIndex}-${value.title}`}>{value.title}<i>✦</i></span>))}</span>)}</p>
      </div> : null}

      <section id="productos" className="es-section" aria-labelledby="es-products-title">
        <Reveal className="es-section__head">
          <h2 id="es-products-title" className="es-h2">{copy.productsTitle}</h2>
          <a className="es-link" href="productos.html">Ver todo <IconArrowRight /></a>
        </Reveal>
        {/* Fashion look: the kit's fashion card, the same on the home, «Ver todo» and related rows. */}
        {cards === 'fashion' ? null : <template data-pagosya-product-template>
          <article className="es-card" data-es-card={card}>
            <a className="es-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <p className="es-card__eyebrow" data-product-field="eyebrow" hidden />
            <h3 className="es-card__name" data-product-field="name">Producto</h3>
            <ul className="es-card__points" data-product-field="points" hidden />
            <p className="es-card__chips" data-product-field="chips" hidden />
            <p className="es-card__deal" data-product-field="deal" hidden />
            <div className="es-card__row">
              <p className="es-card__price" data-product-field="price" />
              <span className="es-card__save" data-product-field="save" hidden />
              {card === 'bar' ? null : <button type="button" className="es-card__add" data-product-add aria-label="Agregar al carrito"><IconPlus /></button>}
            </div>
            {card === 'bar' ? <button type="button" className="es-card__bar" data-product-add>Agregar</button> : null}
          </article>
        </template>}
        <div className="es-grid" data-es-grid={variant('grid', 'grid4')} data-es-cards={cards} data-pagosya-catalog />
      </section>

      <FeatureSlot at="products" />

      <section id="historia" className={story === 'split' && !photos.story ? 'es-section es-story es-story--text' : 'es-section es-story'} data-es-story={story} data-es-band={story === 'overlay' ? undefined : band(0)} aria-labelledby="es-story-title">
        {['split', 'overlay', 'pair'].includes(story) ? <Reveal className="es-story__media">
          <img src={photos.story} alt="" aria-hidden="true" />{story === 'pair' ? <img src={photos.p1} alt="" aria-hidden="true" /> : null}
        </Reveal> : null}
        <Reveal className="es-story__copy" delay={120}>
          <h2 id="es-story-title" className="es-h2">{copy.storyTitle}</h2>
          {story === 'quote' ? <blockquote className="es-story__quote"><p>{copy.storyBody}</p></blockquote>
            : story === 'timeline' ? <ol className="es-story__steps">{sentences.slice(0, 3).map((text, index) => <li key={index}><span>{String(index + 1).padStart(2, '0')}</span><p>{text}</p></li>)}</ol>
            : <p>{copy.storyBody}</p>}
          {story === 'note' ? <p className="es-story__sign">— {store.name}</p> : null}
        </Reveal>
      </section>

      <FeatureSlot at="story" />

      {sections.map((section, index) => <BusinessSection key={section.id} section={section} phone={phone} band={band(1 + index)} />)}

      <FeatureSlot at="values" />

      <section id="valores" className="es-section es-values" data-es-values={values} data-es-band={valuesTone} aria-label="Lo que nos importa">
        {values === 'line' ? <p className="es-values__line" aria-hidden="true">{copy.values.map(value => value.title).join(' · ')}</p> : null}
        <ol>{copy.values.map((value, index) => <li key={value.title}><Reveal delay={index * 90}>{values === 'icons' ? (() => { const Icon = VALUE_ICONS[index % 3]; return <Icon className="es-values__icon" />; })()
          : values === 'checklist' ? <IconCheck className="es-values__icon" /> : <span className="es-values__n">{String(index + 1).padStart(2, '0')}</span>}<h3 className="es-h3">{value.title}</h3><p>{value.text}</p></Reveal></li>)}</ol>
      </section>

      <section id="resenas" className="es-section es-reviews" data-pagosya-reviews-section data-es-band={bands === 'blocks' ? (valuesTone === 'muted' ? 'paper' : 'muted') : band(2 + sections.length)} aria-labelledby="es-reviews-title">
        <h2 id="es-reviews-title" className="es-h2">Lo que dicen nuestros clientes</h2>
        <div className="es-reviews__list" data-pagosya-reviews />
      </section>

      <FeatureSlot at="closing" />

      <section id="cierre" className="es-closing" data-es-closing={closing} aria-labelledby="es-closing-title">
        {closing === 'photo' ? <img className="es-closing__photo" src={photos.hero} alt="" aria-hidden="true" /> : null}
        <Reveal className="es-closing__inner">
          <h2 id="es-closing-title" className="es-h2">{copy.closingLine}</h2>
          <div className="es-actions">
            <a className="es-btn es-btn--light" href="productos.html">{copy.closingCta} <IconArrowUpRight /></a>
            {closing === 'newsletter' && phone ? <a className="es-btn es-btn--ghost" href={`https://wa.me/${phone.replace(/\D/g, '')}`}><IconMessageCircle /> Escríbenos</a> : null}
          </div>
        </Reveal>
      </section>
    </main>
  </Shell>;
}
