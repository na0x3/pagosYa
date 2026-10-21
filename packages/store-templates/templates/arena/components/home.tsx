import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const categories = [copy.home_1, copy.home_2, copy.home_3, copy.home_4, copy.home_5];

const kits = [
  { name: copy.home_6, text: copy.home_7, tone: 'violet' },
  { name: copy.home_8, text: copy.home_9, tone: 'lime' },
  { name: copy.home_10, text: copy.home_11, tone: 'deep' },
];

const drills = [
  { n: '01', title: copy.home_12, text: copy.home_13 },
  { n: '02', title: copy.home_14, text: copy.home_15 },
  { n: '03', title: copy.home_16, text: copy.home_17 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="ar-hero" aria-labelledby="ar-hero-title">
        <div className="ar-hero__copy">
          <p className="ar-kicker">{copy.home_18}</p>
          <h1 id="ar-hero-title" className="ar-hero__title">{store.name}</h1>
          <p className="ar-hero__lead">{copy.home_19}</p>
          <a className="ar-btn" href="#novedades">{copy.home_20}</a>
        </div>
        <div className="ar-hero__art">
          <Parallax strength={50} mobileStrength={20} className="ar-hero__athlete"><img src={photos.p1} alt={copy.home_21} /></Parallax>
          <img className="ar-hero__inset" src={photos.p2} alt={copy.home_22} />
        </div>
      </section>

      <section id="categorias" className="ar-cats" aria-label="Categorías">
        <ul className="ar-cats__list">
          {categories.map(cat => <li key={cat}><a href="#novedades">{cat}</a></li>)}
        </ul>
      </section>

      <section id="novedades" className="ar-shop" aria-labelledby="ar-shop-title">
        <Reveal className="ar-head">
          <h2 id="ar-shop-title" className="ar-title">{copy.home_23}</h2>
          <p className="ar-head__aside">{copy.home_24}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ar-card">
            <a className="ar-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="ar-card__name" data-product-field="name">Producto</h3>
            <p className="ar-card__price" data-product-field="price" />
            <button type="button" className="ar-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ar-grid" data-pagosya-catalog />
      </section>

      <section id="equipo" className="ar-kits" aria-labelledby="ar-kits-title">
        <Reveal className="ar-head">
          <h2 id="ar-kits-title" className="ar-title">{copy.home_25}</h2>
          <p className="ar-head__aside">{copy.home_26}</p>
        </Reveal>
        <div className="ar-kits__grid">
          {kits.map((kit, index) => <Reveal key={kit.name} delay={index * 60}>
            <a className={`ar-kit ar-kit--${kit.tone}`} href="#novedades">
              <span className="ar-kit__name">{kit.name}</span>
              <span className="ar-kit__text">{kit.text}</span>
              <span className="ar-kit__go">Ver más →</span>
            </a>
          </Reveal>)}
        </div>
        <div className="ar-kits__row">
          <img src={photos.p3} alt={copy.home_27} />
          <img src={photos.p4} alt={copy.home_28} />
        </div>
      </section>

      <section id="entrenamiento" className="ar-train" aria-labelledby="ar-train-title">
        <div className="ar-train__photo">
          <Parallax strength={50} mobileStrength={20} className="ar-drift"><img src={photos.cancha} alt={copy.home_29} /></Parallax>
        </div>
        <Reveal className="ar-train__copy">
          <p className="ar-kicker">{copy.home_30}</p>
          <h2 id="ar-train-title" className="ar-title">{copy.home_31}</h2>
          <ol className="ar-train__list">
            {drills.map(drill => <li key={drill.n}>
              <span className="ar-train__n">{drill.n}</span>
              <span><b>{drill.title}</b><br />{drill.text}</span>
            </li>)}
          </ol>
          <a className="ar-btn ar-btn--lime" href="#novedades">{copy.home_32}</a>
        </Reveal>
      </section>

      <section id="ofertas" className="ar-offer" aria-labelledby="ar-offer-title">
        <Reveal className="ar-offer__inner">
          <h2 id="ar-offer-title" className="ar-offer__title">{copy.home_33}</h2>
          <p className="ar-offer__text">{copy.home_34}</p>
          <a className="ar-btn ar-btn--deep" href="#novedades">{copy.home_35}</a>
        </Reveal>
        <img className="ar-offer__crowd" src={photos.hinchada} alt={copy.home_36} />
      </section>

      <section id="boletin" className="ar-news" aria-labelledby="ar-news-title" data-pagosya-subscribe-block>
        <Reveal className="ar-news__inner">
          <h2 id="ar-news-title" className="ar-news__title">{copy.home_37}</h2>
          <p className="ar-news__text">{copy.home_38}</p>
          <button type="button" className="ar-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="ar-news__field">{copy.home_39}</span>
            <span className="ar-news__submit">{copy.home_40}</span>
          </button>
          <p role="status" className="ar-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
