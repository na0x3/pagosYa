import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { copy, photos, store } from './store-data';
import { variant } from './Shell';
import { IconArrowRight, IconArrowUpRight, IconCheck, IconMessageCircle, IconPlus, IconShieldCheck, IconStar, IconTruck } from './icons';

const VALUE_ICONS = [IconStar, IconTruck, IconShieldCheck];

export default function Home() {
  // Variety spec §2: the rolled hero; photo-led variants fall back to the type hero when the photos are missing.
  const rolled = variant('hero', 'full');
  const heroPhotos = [photos.hero, photos.p1, photos.p2].filter(Boolean);
  const multi = rolled === 'collage' || rolled === 'strip';
  const hero = !photos.hero || (multi && heroPhotos.length < 3) ? 'type' : rolled;
  const layered = hero === 'full' || hero === 'poster';
  const card = variant('card', 'plain');
  const sentences = copy.storyBody.split(/(?<=[.!?])\s+/).map(text => text.trim()).filter(Boolean);
  const rolledStory = variant('story', 'split');
  const story = ['split', 'overlay', 'pair'].includes(rolledStory) && !photos.story ? 'note'
    : rolledStory === 'pair' && !photos.p1 ? 'split' : rolledStory === 'timeline' && sentences.length < 2 ? 'note' : rolledStory;
  const values = variant('values', 'numbered');
  const rolledClosing = variant('closing', 'dark');
  const closing = rolledClosing === 'photo' && !photos.hero ? 'dark' : rolledClosing;
  const phone: string = store.phone;
  return <Shell>
    <main id="contenido">
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

      <section id="productos" className="es-section" aria-labelledby="es-products-title">
        <Reveal className="es-section__head">
          <h2 id="es-products-title" className="es-h2">{copy.productsTitle}</h2>
          <a className="es-link" href="productos.html">Ver todo <IconArrowRight /></a>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="es-card" data-es-card={card}>
            <a className="es-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="es-card__name" data-product-field="name">Producto</h3>
            <div className="es-card__row">
              <p className="es-card__price" data-product-field="price" />
              {card === 'bar' ? null : <button type="button" className="es-card__add" data-product-add aria-label="Agregar al carrito"><IconPlus /></button>}
            </div>
            {card === 'bar' ? <button type="button" className="es-card__bar" data-product-add>Agregar</button> : null}
          </article>
        </template>
        <div className="es-grid" data-es-grid={variant('grid', 'grid4')} data-pagosya-catalog />
      </section>

      <section id="historia" className={story === 'split' && !photos.story ? 'es-section es-story es-story--text' : 'es-section es-story'} data-es-story={story} aria-labelledby="es-story-title">
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

      <section id="valores" className="es-section es-values" data-es-values={values} aria-label="Lo que nos importa">
        {values === 'line' ? <p className="es-values__line" aria-hidden="true">{copy.values.map(value => value.title).join(' · ')}</p> : null}
        <ol>{copy.values.map((value, index) => <li key={value.title}><Reveal delay={index * 90}>{values === 'icons' ? (() => { const Icon = VALUE_ICONS[index % 3]; return <Icon className="es-values__icon" />; })()
          : values === 'checklist' ? <IconCheck className="es-values__icon" /> : <span className="es-values__n">{String(index + 1).padStart(2, '0')}</span>}<h3 className="es-h3">{value.title}</h3><p>{value.text}</p></Reveal></li>)}</ol>
      </section>

      <section id="resenas" className="es-section es-reviews" data-pagosya-reviews-section aria-labelledby="es-reviews-title">
        <h2 id="es-reviews-title" className="es-h2">Lo que dicen nuestros clientes</h2>
        <div className="es-reviews__list" data-pagosya-reviews />
      </section>

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
