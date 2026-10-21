import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const genres = [
  { name: copy.home_1, note: copy.home_2, tone: 'blue' },
  { name: copy.home_3, note: copy.home_4, tone: 'yellow' },
  { name: copy.home_5, note: copy.home_6, tone: 'lime' },
  { name: copy.home_7, note: copy.home_8, tone: 'pink' },
];

const picks = [
  { title: copy.home_9, note: copy.home_10, who: copy.home_11 },
  { title: copy.home_12, note: copy.home_13, who: copy.home_14 },
  { title: copy.home_15, note: copy.home_16, who: copy.home_17 },
];

const reviews = [
  { quote: copy.home_18, name: copy.home_19, city: copy.home_20 },
  { quote: copy.home_21, name: copy.home_22, city: copy.home_23 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="ti-hero" aria-labelledby="ti-hero-title">
        <div className="ti-hero__photo"><img src={photos.p1} alt={copy.home_24} /></div>
        <div className="ti-hero__collage">
          <img className="ti-hero__roll" src={photos.p2} alt={copy.home_25} />
          <span className="ti-hero__sticker" aria-hidden="true">{copy.home_26}</span>
        </div>
        <div className="ti-hero__band">
          <h1 id="ti-hero-title" className="ti-hero__title">{copy.home_27}</h1>
          <a className="ti-btn" href="#estantes">{copy.home_28}</a>
        </div>
      </section>

      <section id="estantes" className="ti-shop" aria-labelledby="ti-shop-title">
        <Reveal className="ti-head">
          <h2 id="ti-shop-title" className="ti-title">{copy.home_29}</h2>
          <p className="ti-head__aside">{copy.home_30}{store.name}. Elige uno y lee.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ti-card">
            <a className="ti-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Portada del tomo" /></a>
            <h3 className="ti-card__name" data-product-field="name">Tomo</h3>
            <p className="ti-card__price" data-product-field="price" />
            <button type="button" className="ti-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ti-grid" data-pagosya-catalog />
      </section>

      <section id="generos" className="ti-genres" aria-labelledby="ti-genres-title">
        <Reveal className="ti-head">
          <h2 id="ti-genres-title" className="ti-title">{copy.home_31}</h2>
        </Reveal>
        <div className="ti-genres__grid">
          {genres.map((genre, index) => <Reveal key={genre.name} delay={index * 60}>
            <a className={`ti-genre ti-genre--${genre.tone}`} href="#estantes">
              <span className="ti-genre__name">{genre.name}</span>
              <span className="ti-genre__note">{genre.note}</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="lectura" className="ti-club" aria-labelledby="ti-club-title">
        <div className="ti-club__photo">
          <Parallax strength={60} mobileStrength={22} className="ti-drift"><img src={photos.club} alt={copy.home_32} /></Parallax>
        </div>
        <Reveal className="ti-club__copy">
          <p className="ti-kicker">{copy.home_33}</p>
          <h2 id="ti-club-title" className="ti-title">{copy.home_34}</h2>
          <p>{copy.home_35}</p>
          <a className="ti-btn ti-btn--dark" href="#estantes">{copy.home_36}</a>
        </Reveal>
      </section>

      <section id="recomendados" className="ti-picks" aria-labelledby="ti-picks-title">
        <Reveal className="ti-head">
          <h2 id="ti-picks-title" className="ti-title">{copy.home_37}</h2>
          <p className="ti-head__aside">{copy.home_38}</p>
        </Reveal>
        <div className="ti-picks__grid">
          {picks.map((pick, index) => <Reveal key={pick.title} delay={index * 60}>
            <article className="ti-pick">
              <h3 className="ti-pick__title">{pick.title}</h3>
              <p className="ti-pick__note">{pick.note}</p>
              <p className="ti-pick__who">{pick.who}</p>
            </article>
          </Reveal>)}
        </div>
      </section>

      <section id="resenas" className="ti-reviews" aria-labelledby="ti-reviews-title">
        <Reveal className="ti-head">
          <h2 id="ti-reviews-title" className="ti-title">{copy.home_39}</h2>
        </Reveal>
        <div className="ti-reviews__grid">
          <figure className="ti-reviews__photo"><img src={photos.tienda} alt={copy.home_40} /></figure>
          <div className="ti-quotes">
            {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
              <figure className="ti-quote">
                <blockquote>{review.quote}</blockquote>
                <figcaption><b>{review.name}</b> · {review.city}</figcaption>
              </figure>
            </Reveal>)}
          </div>
        </div>
      </section>

      <section id="boletin" className="ti-news" aria-labelledby="ti-news-title" data-pagosya-subscribe-block>
        <Reveal className="ti-news__inner">
          <h2 id="ti-news-title" className="ti-news__title">{copy.home_41}</h2>
          <p className="ti-news__text">{copy.home_42}</p>
          <button type="button" className="ti-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="ti-news__field">{copy.home_43}</span>
            <span className="ti-news__submit">{copy.home_44}</span>
          </button>
          <p role="status" className="ti-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
