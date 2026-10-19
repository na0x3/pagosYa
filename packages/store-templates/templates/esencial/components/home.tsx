import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { copy, photos } from './store-data';
import { IconArrowRight, IconArrowUpRight, IconPlus } from './icons';

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className={photos.hero ? 'es-hero' : 'es-hero es-hero--plain'} aria-labelledby="es-hero-title">
        {photos.hero ? <Parallax className="es-hero__media" strength={60} mobileStrength={16}><img src={photos.hero} alt="" aria-hidden="true" /></Parallax> : null}
        <div className="es-hero__copy">
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
          <article className="es-card">
            <a className="es-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="es-card__name" data-product-field="name">Producto</h3>
            <div className="es-card__row">
              <p className="es-card__price" data-product-field="price" />
              <button type="button" className="es-card__add" data-product-add aria-label="Agregar al carrito"><IconPlus /></button>
            </div>
          </article>
        </template>
        <div className="es-grid" data-pagosya-catalog />
      </section>

      <section id="historia" className={photos.story ? 'es-section es-story' : 'es-section es-story es-story--text'} aria-labelledby="es-story-title">
        {photos.story ? <Reveal className="es-story__media"><img src={photos.story} alt="" aria-hidden="true" /></Reveal> : null}
        <Reveal className="es-story__copy" delay={120}>
          <h2 id="es-story-title" className="es-h2">{copy.storyTitle}</h2>
          <p>{copy.storyBody}</p>
        </Reveal>
      </section>

      <section id="valores" className="es-section es-values" aria-label="Lo que nos importa">
        <ol>{copy.values.map((value, index) => <li key={value.title}><Reveal delay={index * 90}><span className="es-values__n">{String(index + 1).padStart(2, '0')}</span><h3 className="es-h3">{value.title}</h3><p>{value.text}</p></Reveal></li>)}</ol>
      </section>

      <section id="resenas" className="es-section es-reviews" data-pagosya-reviews-section aria-labelledby="es-reviews-title">
        <h2 id="es-reviews-title" className="es-h2">Lo que dicen nuestros clientes</h2>
        <div className="es-reviews__list" data-pagosya-reviews />
      </section>

      <section id="cierre" className="es-closing" aria-labelledby="es-closing-title">
        <Reveal>
          <h2 id="es-closing-title" className="es-h2">{copy.closingLine}</h2>
          <a className="es-btn es-btn--light" href="productos.html">{copy.closingCta} <IconArrowUpRight /></a>
        </Reveal>
      </section>
    </main>
  </Shell>;
}
