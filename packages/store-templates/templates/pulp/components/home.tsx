import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const eras = [
  { years: copy.home_1, text: copy.home_2 },
  { years: copy.home_3, text: copy.home_4 },
  { years: copy.home_5, text: copy.home_6 },
];

const grades = [
  { label: copy.home_7, text: copy.home_8 },
  { label: copy.home_9, text: copy.home_10 },
  { label: copy.home_11, text: copy.home_12 },
];

const care = [
  { title: copy.home_13, text: copy.home_14 },
  { title: copy.home_15, text: copy.home_16 },
  { title: copy.home_17, text: copy.home_18 },
];

const voices = [
  { quote: copy.home_19, name: copy.home_20, city: copy.home_21 },
  { quote: copy.home_22, name: copy.home_23, city: copy.home_24 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="pu-hero" aria-labelledby="pu-hero-title">
        <div className="pu-hero__burst" aria-hidden="true" />
        <div className="pu-hero__copy">
          <p className="pu-kicker">{copy.home_25}</p>
          <h1 id="pu-hero-title" className="pu-hero__title">{copy.home_26}</h1>
          <p className="pu-hero__lead">{copy.home_27}{store.name}{copy.home_28}</p>
          <a className="pu-btn" href="#boveda">{copy.home_29}</a>
        </div>
        <div className="pu-hero__cover">
          <span className="pu-ribbon">{copy.home_30}</span>
          <img src={photos.p1} alt={copy.home_31} />
        </div>
      </section>

      <section id="boveda" className="pu-shop" aria-labelledby="pu-shop-title">
        <Reveal className="pu-head">
          <h2 id="pu-shop-title" className="pu-title">{copy.home_32}</h2>
          <p className="pu-head__aside">{copy.home_33}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="pu-card">
            <a className="pu-card__media" data-product-link href="product.html">
              <img data-product-field="image" alt="Portada del cómic" />
              <span className="pu-card__price" data-product-field="price" />
            </a>
            <h3 className="pu-card__name" data-product-field="name">Cómic</h3>
            <button type="button" className="pu-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="pu-grid" data-pagosya-catalog />
      </section>

      <section id="epocas" className="pu-eras" aria-labelledby="pu-eras-title">
        <Reveal className="pu-head">
          <h2 id="pu-eras-title" className="pu-title">{copy.home_34}</h2>
        </Reveal>
        <div className="pu-eras__grid">
          {eras.map((era, index) => <Reveal key={era.years} delay={index * 60}>
            <a className="pu-era" href="#boveda">
              <span className="pu-era__years">{era.years}</span>
              <span className="pu-era__text">{era.text}</span>
              <span className="pu-era__go" aria-hidden="true">Ver números →</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="raros" className="pu-rare" aria-labelledby="pu-rare-title">
        <Parallax strength={60} mobileStrength={22} className="pu-drift"><img src={photos.estante} alt={copy.home_35} /></Parallax>
        <Reveal className="pu-rare__card">
          <img className="pu-rare__cover" src={photos.p2} alt={copy.home_36} />
          <div className="pu-rare__copy">
            <p className="pu-kicker pu-kicker--dark">{copy.home_37}</p>
            <h2 id="pu-rare-title" className="pu-title">{copy.home_38}</h2>
            <p>{copy.home_39}</p>
            <dl className="pu-grades">
              {grades.map(grade => <div key={grade.label}><dt>{grade.label}</dt><dd>{grade.text}</dd></div>)}
            </dl>
          </div>
        </Reveal>
      </section>

      <section id="cuidado" className="pu-care" aria-labelledby="pu-care-title">
        <Reveal className="pu-head">
          <h2 id="pu-care-title" className="pu-title">{copy.home_40}</h2>
        </Reveal>
        <div className="pu-care__grid">
          <Reveal className="pu-care__photo"><img src={photos.lupa} alt={copy.home_41} /></Reveal>
          <ul className="pu-care__list">
            {care.map((item, index) => <li key={item.title}>
              <Reveal delay={index * 60}>
                <b className="pu-care__title">{item.title}</b>
                <span className="pu-care__text">{item.text}</span>
              </Reveal>
            </li>)}
          </ul>
        </div>
      </section>

      <section id="voces" className="pu-voices" aria-labelledby="pu-voices-title">
        <Reveal className="pu-head">
          <h2 id="pu-voices-title" className="pu-title">{copy.home_42}</h2>
        </Reveal>
        <div className="pu-voices__grid">
          {voices.map((voice, index) => <Reveal key={voice.name} delay={index * 60}>
            <figure className="pu-letter">
              <blockquote>{voice.quote}</blockquote>
              <figcaption>— {voice.name}, {voice.city}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="pu-news" aria-labelledby="pu-news-title" data-pagosya-subscribe-block>
        <Reveal className="pu-news__inner">
          <h2 id="pu-news-title" className="pu-news__title">{copy.home_43}</h2>
          <p className="pu-news__text">{copy.home_44}</p>
          <button type="button" className="pu-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="pu-news__field">{copy.home_45}</span>
            <span className="pu-news__submit">{copy.home_46}</span>
          </button>
          <p role="status" className="pu-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
