import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const practices = [
  { slot: 'p3', name: copy.home_1, note: copy.home_2, alt: copy.home_3 },
  { slot: 'p4', name: copy.home_4, note: copy.home_5, alt: copy.home_6 },
  { slot: 'estudio', name: copy.home_7, note: copy.home_8, alt: copy.home_9 },
];

const classes = [
  { day: copy.home_10, time: '07:00', name: copy.home_11, room: copy.home_12 },
  { day: copy.home_13, time: '19:00', name: copy.home_14, room: copy.home_15 },
  { day: copy.home_16, time: '09:30', name: copy.home_17, room: copy.home_18 },
];

const reviews = [
  { quote: copy.home_19, name: copy.home_20, city: copy.home_21 },
  { quote: copy.home_22, name: copy.home_23, city: copy.home_24 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="as-hero" aria-labelledby="as-hero-title">
        <div className="as-hero__copy">
          <p className="as-hero__label">{copy.home_25}</p>
          <h1 id="as-hero-title" className="as-hero__title">{copy.home_26}</h1>
          <p className="as-hero__text">{copy.home_27}{store.name}.</p>
          <a className="as-btn" href="#prendas">{copy.home_28}</a>
          <a className="as-tile" href="#prendas" aria-label="Ver el conjunto destacado">
            <img src={photos.p2} alt={copy.home_29} />
            <span><b>{copy.home_30}</b>{copy.home_31}</span>
          </a>
        </div>
        <div className="as-hero__photo"><img src={photos.p1} alt={copy.home_32} /></div>
      </section>

      <section id="prendas" className="as-shop" aria-labelledby="as-shop-title">
        <Reveal className="as-head">
          <h2 id="as-shop-title" className="as-title">{copy.home_33}</h2>
          <p className="as-head__aside">{copy.home_34}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="as-card">
            <a className="as-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la prenda" /></a>
            <h3 className="as-card__name" data-product-field="name">Prenda</h3>
            <p className="as-card__price" data-product-field="price" />
            <button type="button" className="as-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="as-grid" data-pagosya-catalog />
      </section>

      <section id="practica" className="as-practice" aria-labelledby="as-practice-title">
        <Reveal className="as-head">
          <h2 id="as-practice-title" className="as-title">{copy.home_35}</h2>
        </Reveal>
        <div className="as-practice__grid">
          {practices.map((item, index) => <Reveal key={item.name} delay={index * 60}>
            <a className="as-practice__item" href="#prendas">
              <img src={photos[item.slot]} alt={item.alt} />
              <span className="as-practice__name">{item.name}</span>
              <span className="as-practice__note">{item.note}</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="tejido" className="as-fabric" aria-labelledby="as-fabric-title">
        <div className="as-fabric__photo">
          <Parallax strength={60} mobileStrength={22} className="as-drift"><img src={photos.detalle} alt={copy.home_36} /></Parallax>
        </div>
        <Reveal className="as-fabric__copy">
          <p className="as-kicker">{copy.home_37}</p>
          <h2 id="as-fabric-title" className="as-title">{copy.home_38}</h2>
          <p>{copy.home_39}</p>
        </Reveal>
      </section>

      <section id="clases" className="as-classes" aria-labelledby="as-classes-title">
        <Reveal className="as-head">
          <h2 id="as-classes-title" className="as-title">{copy.home_40}</h2>
          <p className="as-head__aside">{copy.home_41}</p>
        </Reveal>
        <ul className="as-classes__list">
          {classes.map((item, index) => <li key={item.name}>
            <Reveal delay={index * 60}>
              <span className="as-classes__when">{item.day} · {item.time}</span>
              <span className="as-classes__name">{item.name}</span>
              <span className="as-classes__room">{item.room}</span>
              <a className="as-classes__link" href="#boletin">Reservar</a>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="resenas" className="as-reviews" aria-labelledby="as-reviews-title">
        <Reveal className="as-head">
          <h2 id="as-reviews-title" className="as-title">{copy.home_42}</h2>
        </Reveal>
        <div className="as-quotes">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
            <figure className="as-quote">
              <blockquote>{review.quote}</blockquote>
              <figcaption><b>{review.name}</b> · {review.city}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="as-news" aria-labelledby="as-news-title" data-pagosya-subscribe-block>
        <Reveal className="as-news__inner">
          <h2 id="as-news-title" className="as-news__title">{copy.home_43}</h2>
          <p className="as-news__text">{copy.home_44}</p>
          <button type="button" className="as-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="as-news__field">{copy.home_45}</span>
            <span className="as-news__submit">{copy.home_46}</span>
          </button>
          <p role="status" className="as-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
