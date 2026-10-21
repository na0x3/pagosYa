import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const hero = [
  { slot: 'p1', tone: 'teal', age: '1–2 años', name: copy.home_1, alt: copy.home_2 },
  { slot: 'p2', tone: 'cobalt', age: '0–1 año', name: copy.home_3, alt: copy.home_4 },
  { slot: 'p3', tone: 'orange', age: '2–3 años', name: copy.home_5, alt: copy.home_6 },
];

const ages = [
  { range: '0–1', label: copy.home_7, note: copy.home_8, tone: 'blush' },
  { range: '1–2', label: copy.home_9, note: copy.home_10, tone: 'sky' },
  { range: '3–5', label: copy.home_11, note: copy.home_12, tone: 'lemon' },
  { range: '6+', label: copy.home_13, note: copy.home_14, tone: 'mint' },
];

const promises = [
  { title: copy.home_15, text: copy.home_16 },
  { title: copy.home_17, text: copy.home_18 },
  { title: copy.home_19, text: copy.home_20 },
];

const reviews = [
  { quote: copy.home_21, name: copy.home_22, city: copy.home_23 },
  { quote: copy.home_24, name: copy.home_25, city: copy.home_26 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="tr-hero" aria-labelledby="tr-hero-title">
        <h1 id="tr-hero-title" className="tr-hero__name">{store.name}</h1>
        <p className="tr-hero__lead">{copy.home_27}</p>
        <div className="tr-hero__cards">
          {hero.map((card, index) => <Reveal key={card.slot} delay={index * 70}>
            <a className={`tr-block tr-block--${card.tone}`} href="#juguetes">
              <span className="tr-block__age">{card.age}</span>
              <img src={photos[card.slot]} alt={card.alt} />
              <span className="tr-block__row"><span className="tr-block__name">{card.name}</span><span className="tr-block__go" aria-hidden="true">→</span></span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="edades" className="tr-ages" aria-labelledby="tr-ages-title">
        <Reveal className="tr-head">
          <h2 id="tr-ages-title" className="tr-title">{copy.home_28}</h2>
          <p className="tr-head__aside">{copy.home_29}</p>
        </Reveal>
        <div className="tr-ages__grid">
          {ages.map((age, index) => <Reveal key={age.range} delay={index * 60}>
            <a className={`tr-age tr-age--${age.tone}`} href="#juguetes">
              <span className="tr-age__range">{age.range}</span>
              <span className="tr-age__label">{age.label}</span>
              <span className="tr-age__note">{age.note}</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="juguetes" className="tr-shop" aria-labelledby="tr-shop-title">
        <Reveal className="tr-head">
          <h2 id="tr-shop-title" className="tr-title">{copy.home_30}</h2>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="tr-card">
            <a className="tr-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del juguete" /></a>
            <h3 className="tr-card__name" data-product-field="name">Juguete</h3>
            <p className="tr-card__price" data-product-field="price" />
            <button type="button" className="tr-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="tr-grid" data-pagosya-catalog />
      </section>

      <section id="madera" className="tr-wood" aria-labelledby="tr-wood-title">
        <div className="tr-wood__photo">
          <Parallax strength={70} mobileStrength={24} className="tr-drift"><img src={photos.taller} alt={copy.home_31} /></Parallax>
        </div>
        <Reveal className="tr-wood__copy">
          <p className="tr-kicker">{copy.home_32}</p>
          <h2 id="tr-wood-title" className="tr-title">{copy.home_33}</h2>
          <p>{copy.home_34}</p>
          <a className="tr-btn" href="#juguetes">{copy.home_35}</a>
        </Reveal>
      </section>

      <section id="seguridad" className="tr-safe" aria-labelledby="tr-safe-title">
        <Reveal className="tr-head">
          <h2 id="tr-safe-title" className="tr-title">{copy.home_36}</h2>
        </Reveal>
        <ul className="tr-safe__list">
          {promises.map((item, index) => <li key={item.title}>
            <Reveal delay={index * 60}>
              <span className="tr-safe__badge" aria-hidden="true">{index + 1}</span>
              <b className="tr-safe__title">{item.title}</b>
              <span className="tr-safe__text">{item.text}</span>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="regalos" className="tr-gift" aria-labelledby="tr-gift-title">
        <Reveal className="tr-gift__inner">
          <img className="tr-gift__photo" src={photos.juego} alt={copy.home_37} />
          <div className="tr-gift__copy">
            <h2 id="tr-gift-title" className="tr-title">{copy.home_38}</h2>
            <p>{copy.home_39}</p>
            <a className="tr-btn tr-btn--dark" href="#juguetes">{copy.home_40}</a>
          </div>
        </Reveal>
      </section>

      <section id="resenas" className="tr-reviews" aria-labelledby="tr-reviews-title">
        <Reveal className="tr-head">
          <h2 id="tr-reviews-title" className="tr-title">{copy.home_41}</h2>
        </Reveal>
        <div className="tr-quotes">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
            <figure className="tr-quote">
              <blockquote>{review.quote}</blockquote>
              <figcaption><b>{review.name}</b> · {review.city}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="tr-news" aria-labelledby="tr-news-title" data-pagosya-subscribe-block>
        <Reveal className="tr-news__inner">
          <h2 id="tr-news-title" className="tr-news__title">{copy.home_42}</h2>
          <p className="tr-news__text">{copy.home_43}</p>
          <button type="button" className="tr-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="tr-news__field">{copy.home_44}</span>
            <span className="tr-news__submit">{copy.home_45}</span>
          </button>
          <p role="status" className="tr-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
