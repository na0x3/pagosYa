import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const ingredients = [
  { slot: 'p2', name: copy.home_1, note: copy.home_2, alt: copy.home_3 },
  { slot: 'p3', name: copy.home_4, note: copy.home_5, alt: copy.home_6 },
  { slot: 'p1', name: copy.home_7, note: copy.home_8, alt: copy.home_9 },
  { slot: 'p4', name: copy.home_10, note: copy.home_11, alt: copy.home_12 },
];

const ritual = [
  { n: '1', title: copy.home_13, text: copy.home_14 },
  { n: '2', title: copy.home_15, text: copy.home_16 },
  { n: '3', title: copy.home_17, text: copy.home_18 },
];

const reviews = [
  { quote: copy.home_19, name: copy.home_20, city: copy.home_21 },
  { quote: copy.home_22, name: copy.home_23, city: copy.home_24 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="sv-hero" aria-labelledby="sv-hero-title">
        <img className="sv-hero__photo" src={photos.p1} alt={copy.home_25} />
        <div className="sv-hero__copy">
          <p className="sv-kicker">{copy.home_26}</p>
          <h1 id="sv-hero-title" className="sv-hero__title">{copy.home_27}</h1>
          <a className="sv-btn" href="#productos">{copy.home_28}</a>
        </div>
      </section>

      <section id="productos" className="sv-shop" aria-labelledby="sv-shop-title">
        <Reveal className="sv-head">
          <h2 id="sv-shop-title" className="sv-title">{copy.home_29}</h2>
          <p className="sv-head__aside">{copy.home_30}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="sv-card">
            <a className="sv-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="sv-card__name" data-product-field="name">Producto</h3>
            <p className="sv-card__price" data-product-field="price" />
            <button type="button" className="sv-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="sv-grid" data-pagosya-catalog />
      </section>

      <section id="ingredientes" className="sv-ingredients" aria-labelledby="sv-ing-title">
        <Reveal className="sv-head">
          <h2 id="sv-ing-title" className="sv-title">{copy.home_31}</h2>
        </Reveal>
        <ul className="sv-ingredients__grid">
          {ingredients.map((item, index) => <li key={item.name}>
            <Reveal delay={index * 60}>
              <span className="sv-ing__photo"><img src={photos[item.slot]} alt={item.alt} /></span>
              <b className="sv-ing__name">{item.name}</b>
              <span className="sv-ing__note">{item.note}</span>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="ritual" className="sv-ritual" aria-labelledby="sv-ritual-title">
        <div className="sv-ritual__photo"><img src={photos.ritual} alt={copy.home_32} /></div>
        <Reveal className="sv-ritual__copy">
          <p className="sv-kicker sv-kicker--dark">{copy.home_33}</p>
          <h2 id="sv-ritual-title" className="sv-title">{copy.home_34}</h2>
          <ol className="sv-steps">
            {ritual.map(step => <li key={step.n}>
              <span className="sv-steps__n">{step.n}</span>
              <span><b>{step.title}</b>{step.text}</span>
            </li>)}
          </ol>
        </Reveal>
      </section>

      <section id="historia" className="sv-story" aria-labelledby="sv-story-title">
        <Parallax strength={60} mobileStrength={22} className="sv-drift"><img src={photos.taller} alt={copy.home_35} /></Parallax>
        <Reveal className="sv-story__copy">
          <h2 id="sv-story-title" className="sv-title sv-title--light">{copy.home_36}</h2>
          <p>{copy.home_37}</p>
          <a className="sv-btn sv-btn--light" href="#productos">{copy.home_38}</a>
        </Reveal>
      </section>

      <section id="resenas" className="sv-reviews" aria-labelledby="sv-reviews-title">
        <Reveal className="sv-head">
          <h2 id="sv-reviews-title" className="sv-title">{copy.home_39}</h2>
        </Reveal>
        <div className="sv-quotes">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
            <figure className="sv-quote">
              <blockquote>{review.quote}</blockquote>
              <figcaption><b>{review.name}</b> · {review.city}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="sv-news" aria-labelledby="sv-news-title" data-pagosya-subscribe-block>
        <Reveal className="sv-news__inner">
          <h2 id="sv-news-title" className="sv-news__title">{copy.home_40}{store.name}</h2>
          <p className="sv-news__text">{copy.home_41}</p>
          <button type="button" className="sv-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="sv-news__field">{copy.home_42}</span>
            <span className="sv-news__submit">{copy.home_43}</span>
          </button>
          <p role="status" className="sv-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
