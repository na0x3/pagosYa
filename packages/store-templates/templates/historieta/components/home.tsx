import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const panels = [
  { slot: 'tienda', tag: copy.home_1, text: copy.home_2, alt: copy.home_3 },
  { slot: 'lectura', tag: copy.home_4, text: copy.home_5, alt: copy.home_6 },
  { slot: 'p2', tag: copy.home_7, text: copy.home_8, alt: copy.home_9 },
];

const series = [
  { name: copy.home_10, note: copy.home_11, tone: 'hero' },
  { name: copy.home_12, note: copy.home_13, tone: 'adv' },
  { name: copy.home_14, note: copy.home_15, tone: 'fun' },
  { name: copy.home_16, note: copy.home_17, tone: 'old' },
];

const voices = [
  { quote: copy.home_18, name: copy.home_19, city: copy.home_20 },
  { quote: copy.home_21, name: copy.home_22, city: copy.home_23 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="hi-hero" aria-labelledby="hi-hero-title">
        <div className="hi-hero__art">
          <div className="hi-hero__cover"><img src={photos.p1} alt={copy.home_24} /></div>
        </div>
        <Reveal className="hi-bubble">
          <p className="hi-kicker">{copy.home_25}</p>
          <h1 id="hi-hero-title" className="hi-hero__title">{copy.home_26}</h1>
          <p className="hi-bubble__text">{copy.home_27}{store.name}{copy.home_28}</p>
          <a className="hi-btn" href="#novedades">{copy.home_29}<span aria-hidden="true">↗</span></a>
        </Reveal>
      </section>

      <section id="novedades" className="hi-shop" aria-labelledby="hi-shop-title">
        <Reveal className="hi-head">
          <h2 id="hi-shop-title" className="hi-title">{copy.home_30}</h2>
          <p className="hi-head__aside">{copy.home_31}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="hi-card">
            <a className="hi-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Portada del cómic" /></a>
            <h3 className="hi-card__name" data-product-field="name">Cómic</h3>
            <p className="hi-card__price" data-product-field="price" />
            <button type="button" className="hi-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="hi-grid" data-pagosya-catalog />
      </section>

      <section id="historia" className="hi-story" aria-labelledby="hi-story-title">
        <Reveal className="hi-head">
          <h2 id="hi-story-title" className="hi-title">{copy.home_32}</h2>
        </Reveal>
        <div className="hi-panels">
          {panels.map((panel, index) => <Reveal key={panel.slot} delay={index * 60}>
            <figure className="hi-panel">
              <img src={photos[panel.slot]} alt={panel.alt} />
              <figcaption><b>{panel.tag}</b>{panel.text}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="series" className="hi-series" aria-labelledby="hi-series-title">
        <Reveal className="hi-head">
          <h2 id="hi-series-title" className="hi-title">{copy.home_33}</h2>
        </Reveal>
        <div className="hi-series__grid">
          {series.map((item, index) => <Reveal key={item.name} delay={index * 60}>
            <a className={`hi-genre hi-genre--${item.tone}`} href="#novedades">
              <span className="hi-genre__name">{item.name}</span>
              <span className="hi-genre__note">{item.note}</span>
              <span className="hi-genre__go" aria-hidden="true">→</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="coleccion" className="hi-feature" aria-labelledby="hi-feature-title">
        <Parallax strength={70} mobileStrength={24} className="hi-drift"><img src={photos.p3} alt={copy.home_34} /></Parallax>
        <Reveal className="hi-feature__copy">
          <span className="hi-badge">{copy.home_35}</span>
          <h2 id="hi-feature-title" className="hi-title">{copy.home_36}</h2>
          <p>{copy.home_37}</p>
          <a className="hi-btn hi-btn--dark" href="#novedades">{copy.home_38}</a>
        </Reveal>
      </section>

      <section id="voces" className="hi-voices" aria-labelledby="hi-voices-title">
        <Reveal className="hi-head">
          <h2 id="hi-voices-title" className="hi-title">{copy.home_39}</h2>
        </Reveal>
        <div className="hi-voices__grid">
          {voices.map((voice, index) => <Reveal key={voice.name} delay={index * 60}>
            <figure className="hi-say">
              <blockquote>{voice.quote}</blockquote>
              <figcaption><b>{voice.name}</b> · {voice.city}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="suscripcion" className="hi-news" aria-labelledby="hi-news-title" data-pagosya-subscribe-block>
        <Reveal className="hi-news__inner">
          <h2 id="hi-news-title" className="hi-news__title">{copy.home_40}</h2>
          <p className="hi-news__text">{copy.home_41}</p>
          <button type="button" className="hi-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="hi-news__field">{copy.home_42}</span>
            <span className="hi-news__submit">{copy.home_43}</span>
          </button>
          <p role="status" className="hi-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
