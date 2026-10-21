import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const benefits = [
  { title: copy.home_1, text: copy.home_2 },
  { title: copy.home_3, text: copy.home_4 },
  { title: copy.home_5, text: copy.home_6 },
];

const actives = [
  { name: copy.home_7, note: copy.home_8 },
  { name: copy.home_9, note: copy.home_10 },
  { name: copy.home_11, note: copy.home_12 },
  { name: copy.home_13, note: copy.home_14 },
];

const reviews = [
  { quote: copy.home_15, name: copy.home_16, city: copy.home_17 },
  { quote: copy.home_18, name: copy.home_19, city: copy.home_20 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="pe-hero" aria-labelledby="pe-hero-title">
        <div className="pe-hero__copy">
          <p className="pe-kicker">{copy.home_21}</p>
          <h1 id="pe-hero-title" className="pe-hero__title">{copy.home_22}</h1>
          <p className="pe-hero__lead">{copy.home_23}{store.name}.</p>
          <a className="pe-btn" href="#productos">{copy.home_24}<span aria-hidden="true">→</span></a>
        </div>
        <div className="pe-hero__stage">
          <img className="pe-hero__photo" src={photos.p1} alt={copy.home_25} />
          <aside className="pe-card-float" aria-label="Producto destacado">
            <div>
              <p className="pe-card-float__name">{copy.home_26}</p>
              <p className="pe-card-float__note">{copy.home_27}</p>
              <a className="pe-card-float__link" href="#estrella">{copy.home_28}</a>
            </div>
            <img src={photos.p2} alt={copy.home_29} />
          </aside>
        </div>
      </section>

      <section id="estrella" className="pe-star" aria-labelledby="pe-star-title">
        <Reveal className="pe-star__photo"><img src={photos.p2} alt={copy.home_30} /></Reveal>
        <Reveal className="pe-star__copy" delay={80}>
          <p className="pe-kicker">{copy.home_31}</p>
          <h2 id="pe-star-title" className="pe-title">{copy.home_32}</h2>
          <ul className="pe-benefits">
            {benefits.map(item => <li key={item.title}><b>{item.title}</b><span>{item.text}</span></li>)}
          </ul>
          <a className="pe-btn" href="#productos">{copy.home_33}</a>
        </Reveal>
      </section>

      <section id="productos" className="pe-shop" aria-labelledby="pe-shop-title">
        <Reveal className="pe-head">
          <h2 id="pe-shop-title" className="pe-title">{copy.home_34}</h2>
          <p className="pe-head__aside">{copy.home_35}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="pe-card">
            <a className="pe-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="pe-card__name" data-product-field="name">Producto</h3>
            <p className="pe-card__price" data-product-field="price" />
            <button type="button" className="pe-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="pe-grid" data-pagosya-catalog />
      </section>

      <section id="ingredientes" className="pe-actives" aria-labelledby="pe-actives-title">
        <div className="pe-actives__photo">
          <Parallax strength={50} mobileStrength={20} className="pe-drift"><img src={photos.textura} alt={copy.home_36} /></Parallax>
        </div>
        <Reveal className="pe-actives__copy">
          <p className="pe-kicker">{copy.home_37}</p>
          <h2 id="pe-actives-title" className="pe-title">{copy.home_38}</h2>
          <ul className="pe-actives__list">
            {actives.map((item, index) => <li key={item.name}><span className="pe-actives__n">{index + 1}</span><span><b>{item.name}</b>{item.note}</span></li>)}
          </ul>
        </Reveal>
      </section>

      <section id="resultados" className="pe-results" aria-labelledby="pe-results-title">
        <Reveal className="pe-results__inner">
          <img className="pe-results__photo" src={photos.rutina} alt={copy.home_39} />
          <div>
            <h2 id="pe-results-title" className="pe-title">{copy.home_40}</h2>
            <p className="pe-results__claim">{copy.home_41}</p>
            <p className="pe-results__note">{copy.home_42}</p>
          </div>
        </Reveal>
      </section>

      <section id="resenas" className="pe-reviews" aria-labelledby="pe-reviews-title">
        <Reveal className="pe-head">
          <h2 id="pe-reviews-title" className="pe-title">{copy.home_43}</h2>
        </Reveal>
        <div className="pe-quotes">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
            <figure className="pe-quote">
              <blockquote>{review.quote}</blockquote>
              <figcaption><b>{review.name}</b> · {review.city}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="pe-news" aria-labelledby="pe-news-title" data-pagosya-subscribe-block>
        <Reveal className="pe-news__inner">
          <h2 id="pe-news-title" className="pe-news__title">{copy.home_44}</h2>
          <p className="pe-news__text">{copy.home_45}</p>
          <button type="button" className="pe-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="pe-news__field">{copy.home_46}</span>
            <span className="pe-news__submit">{copy.home_47}</span>
          </button>
          <p role="status" className="pe-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
