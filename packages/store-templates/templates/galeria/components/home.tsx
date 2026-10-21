import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const steps = [
  { n: '1', title: copy.home_1, text: copy.home_2 },
  { n: '2', title: copy.home_3, text: copy.home_4 },
  { n: '3', title: copy.home_5, text: copy.home_6 },
];

const series = [
  { slot: 'p2', name: copy.home_7, note: copy.home_8, alt: copy.home_9 },
  { slot: 'p3', name: copy.home_10, note: copy.home_11, alt: copy.home_12 },
  { slot: 'p4', name: copy.home_13, note: copy.home_14, alt: copy.home_15 },
  { slot: 'p1', name: copy.home_16, note: copy.home_17, alt: copy.home_18 },
];

const shows = [
  { date: copy.home_19, place: copy.home_20, title: copy.home_21 },
  { date: copy.home_22, place: copy.home_23, title: copy.home_24 },
  { date: copy.home_25, place: copy.home_26, title: copy.home_27 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="ga-hero" aria-labelledby="ga-hero-title">
        <img className="ga-hero__art" src={photos.p1} alt={copy.home_28} />
        <div className="ga-hero__caption">
          <h1 id="ga-hero-title" className="ga-hero__title">{copy.home_29}</h1>
          <p className="ga-hero__sub">{copy.home_30}{store.name}</p>
          <a className="ga-link" href="#obras">{copy.home_31}<span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <section id="obras" className="ga-shop" aria-labelledby="ga-shop-title">
        <Reveal className="ga-head">
          <h2 id="ga-shop-title" className="ga-title">{copy.home_32}</h2>
          <p className="ga-head__aside">{copy.home_33}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ga-card">
            <a className="ga-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la obra" /></a>
            <h3 className="ga-card__name" data-product-field="name">Obra</h3>
            <p className="ga-card__meta">Óleo sobre lienzo</p>
            <p className="ga-card__price" data-product-field="price" />
            <button type="button" className="ga-card__add" data-product-add>Agregar a mi selección</button>
          </article>
        </template>
        <div className="ga-grid" data-pagosya-catalog />
      </section>

      <section id="artista" className="ga-artist" aria-labelledby="ga-artist-title">
        <div className="ga-artist__photo">
          <Parallax strength={60} mobileStrength={22} className="ga-drift"><img src={photos.estudio} alt={copy.home_34} /></Parallax>
        </div>
        <Reveal className="ga-artist__copy">
          <p className="ga-kicker">{copy.home_35}</p>
          <h2 id="ga-artist-title" className="ga-title">{copy.home_36}</h2>
          <p>{copy.home_37}</p>
          <p>{copy.home_38}</p>
        </Reveal>
      </section>

      <section id="coleccionar" className="ga-collect" aria-labelledby="ga-collect-title">
        <Reveal className="ga-head">
          <h2 id="ga-collect-title" className="ga-title">{copy.home_39}</h2>
        </Reveal>
        <ol className="ga-steps">
          {steps.map((step, index) => <li key={step.n}>
            <Reveal delay={index * 60}>
              <span className="ga-steps__n">{step.n}</span>
              <b className="ga-steps__title">{step.title}</b>
              <span className="ga-steps__text">{step.text}</span>
            </Reveal>
          </li>)}
        </ol>
      </section>

      <section id="serie" className="ga-series" aria-labelledby="ga-series-title">
        <Reveal className="ga-head">
          <h2 id="ga-series-title" className="ga-title">{copy.home_40}</h2>
        </Reveal>
        <ul className="ga-rail">
          {series.map(item => <li key={item.slot}>
            <a href="#obras">
              <img src={photos[item.slot]} alt={item.alt} />
              <span className="ga-rail__name">{item.name}</span>
              <span className="ga-rail__note">{item.note}</span>
            </a>
          </li>)}
        </ul>
      </section>

      <section id="exposiciones" className="ga-shows" aria-labelledby="ga-shows-title">
        <Reveal className="ga-head">
          <h2 id="ga-shows-title" className="ga-title">{copy.home_41}</h2>
        </Reveal>
        <ul className="ga-shows__list">
          {shows.map((show, index) => <li key={show.title}>
            <Reveal delay={index * 60}>
              <span className="ga-shows__date">{show.date}</span>
              <span className="ga-shows__title">{show.title}</span>
              <span className="ga-shows__place">{show.place}</span>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="boletin" className="ga-news" aria-labelledby="ga-news-title" data-pagosya-subscribe-block>
        <Reveal className="ga-news__inner">
          <h2 id="ga-news-title" className="ga-news__title">{copy.home_42}</h2>
          <p className="ga-news__text">{copy.home_43}</p>
          <button type="button" className="ga-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="ga-news__field">{copy.home_44}</span>
            <span className="ga-news__submit">{copy.home_45}</span>
          </button>
          <p role="status" className="ga-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
