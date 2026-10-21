import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const rituals = [
  { slot: 'bano', name: copy.home_1, note: copy.home_2, alt: copy.home_3 },
  { slot: 'cocina', name: copy.home_4, note: copy.home_5, alt: copy.home_6 },
  { slot: 'limpieza', name: copy.home_7, note: copy.home_8, alt: copy.home_9 },
];

const figures = [
  { before: '', em: '0', after: copy.home_10, note: copy.home_11 },
  { before: '', em: '100%', after: 'compostable', note: copy.home_12 },
  { before: copy.home_13, em: copy.home_14, after: '', note: copy.home_15 },
];

const steps = [
  { title: copy.home_16, text: copy.home_17 },
  { title: copy.home_18, text: copy.home_19 },
  { title: copy.home_20, text: copy.home_21 },
];

const reviews = [
  { quote: copy.home_22, name: copy.home_23, city: copy.home_24 },
  { quote: copy.home_25, name: copy.home_26, city: copy.home_27 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="origen" className="br-hero" aria-labelledby="br-hero-title">
        <img className="br-hero__photo" src={photos.hero} alt={copy.home_28} />
        <div className="br-hero__copy">
          <h1 id="br-hero-title" className="br-hero__title">{store.name}</h1>
          <p className="br-hero__text">{copy.home_29}</p>
          <a className="br-btn br-btn--cream" href="#esenciales">{copy.home_30}</a>
        </div>
      </section>

      <section id="esenciales" className="br-shop" aria-labelledby="br-shop-title">
        <Reveal className="br-head">
          <p className="br-kicker">{copy.home_31}</p>
          <h2 id="br-shop-title" className="br-title">{copy.home_32}<em>{copy.home_33}</em></h2>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="br-card">
            <a className="br-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="br-card__body">
              <h3 className="br-card__name" data-product-field="name">Producto</h3>
              <p className="br-card__price" data-product-field="price" />
            </div>
            <button type="button" className="br-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="br-grid" data-pagosya-catalog />
      </section>

      <section id="rituales" className="br-rituals" aria-labelledby="br-rituals-title">
        <Reveal className="br-head br-head--center">
          <p className="br-kicker">{copy.home_34}</p>
          <h2 id="br-rituals-title" className="br-title">{copy.home_35}</h2>
        </Reveal>
        <div className="br-rituals__rail">
          {rituals.map((ritual, index) => <Reveal key={ritual.slot} delay={index * 80} className="br-rituals__item">
            <a className="br-tile" href="#esenciales">
              <img src={photos[ritual.slot]} alt={ritual.alt} />
              <span className="br-tile__label">
                <span className="br-tile__name">{ritual.name}</span>
                <span className="br-tile__note">{ritual.note}</span>
              </span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="sin-plastico" className="br-figures" aria-labelledby="br-figures-title">
        <h2 id="br-figures-title" className="br-figures__title">{copy.home_36}</h2>
        <ul className="br-figures__list">
          {figures.map((figure, index) => <li key={figure.em}>
            <Reveal delay={index * 80} className="br-figure">
              <p className="br-figure__big">{figure.before} <em>{figure.em}</em> {figure.after}</p>
              <p className="br-figure__note">{figure.note}</p>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="recarga" className="br-refill" aria-labelledby="br-refill-title">
        <div className="br-refill__photo">
          <Parallax strength={70} mobileStrength={26} className="br-drift"><img src={photos.recarga} alt={copy.home_37} /></Parallax>
        </div>
        <Reveal className="br-refill__copy">
          <p className="br-kicker">{copy.home_38}</p>
          <h2 id="br-refill-title" className="br-title">{copy.home_39}<em>{copy.home_40}</em></h2>
          <p className="br-refill__text">{copy.home_41}{store.name}{copy.home_42}</p>
          <ol className="br-steps">
            {steps.map((step, index) => <li key={step.title}>
              <span className="br-steps__n" aria-hidden="true">{index + 1}</span>
              <span><b>{step.title}</b><span>{step.text}</span></span>
            </li>)}
          </ol>
          <a className="br-btn" href="#esenciales">{copy.home_43}</a>
        </Reveal>
      </section>

      <section id="resenas" className="br-reviews" aria-labelledby="br-reviews-title">
        <Reveal className="br-head br-head--center">
          <p className="br-kicker">{copy.home_44}</p>
          <h2 id="br-reviews-title" className="br-title">{copy.home_45}</h2>
        </Reveal>
        <div className="br-reviews__grid">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 80} className="br-quote">
            <figure>
              <span className="br-quote__mark" aria-hidden="true">“</span>
              <blockquote className="br-quote__text">{review.quote}</blockquote>
              <figcaption className="br-quote__who"><b>{review.name}</b> · {review.city}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="br-news" aria-labelledby="br-news-title" data-pagosya-subscribe-block>
        <Reveal className="br-news__inner">
          <h2 id="br-news-title" className="br-news__title">{copy.home_46}</h2>
          <p className="br-news__text">{copy.home_47}</p>
          <button type="button" className="br-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="br-news__field">{copy.home_48}</span>
            <span className="br-news__submit">{copy.home_49}</span>
          </button>
          <p role="status" className="br-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
