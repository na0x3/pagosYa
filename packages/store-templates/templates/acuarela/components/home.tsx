import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const categories = [
  { name: copy.home_1, tone: 'red' },
  { name: copy.home_2, tone: 'blue' },
  { name: copy.home_3, tone: 'ochre' },
  { name: copy.home_4, tone: 'lilac' },
  { name: copy.home_5, tone: 'ink' },
];

const sets = [
  { name: copy.home_6, text: copy.home_7, tone: 'red' },
  { name: copy.home_8, text: copy.home_9, tone: 'blue' },
  { name: copy.home_10, text: copy.home_11, tone: 'ochre' },
];

const tips = [
  { n: '1', title: copy.home_12, text: copy.home_13 },
  { n: '2', title: copy.home_14, text: copy.home_15 },
  { n: '3', title: copy.home_16, text: copy.home_17 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="ac-hero" aria-labelledby="ac-hero-title">
        <h1 id="ac-hero-title" className="ac-hero__name">{store.name}</h1>
        <div className="ac-hero__bar">
          <p className="ac-hero__lead">{copy.home_18}</p>
          <a className="ac-btn" href="#pinturas">{copy.home_19}</a>
        </div>
        <div className="ac-hero__photo"><img src={photos.p1} alt={copy.home_20} /></div>
      </section>

      <section id="pinturas" className="ac-shop" aria-labelledby="ac-shop-title">
        <Reveal className="ac-head">
          <h2 id="ac-shop-title" className="ac-title">{copy.home_21}</h2>
          <p className="ac-head__aside">{copy.home_22}</p>
        </Reveal>
        <ul className="ac-chips" aria-label="Categorías">
          {categories.map(cat => <li key={cat.name}><a className={`ac-chip ac-chip--${cat.tone}`} href="#pinturas">{cat.name}</a></li>)}
        </ul>
        <template data-pagosya-product-template>
          <article className="ac-card">
            <a className="ac-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="ac-card__name" data-product-field="name">Producto</h3>
            <p className="ac-card__price" data-product-field="price" />
            <button type="button" className="ac-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ac-grid" data-pagosya-catalog />
      </section>

      <section id="sets" className="ac-sets" aria-labelledby="ac-sets-title">
        <Reveal className="ac-head">
          <h2 id="ac-sets-title" className="ac-title">{copy.home_23}</h2>
        </Reveal>
        <div className="ac-sets__grid">
          {sets.map((set, index) => <Reveal key={set.name} delay={index * 60}>
            <a className={`ac-set ac-set--${set.tone}`} href="#pinturas">
              <span className="ac-set__name">{set.name}</span>
              <span className="ac-set__text">{set.text}</span>
              <span className="ac-set__go">Ver el set →</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="consejos" className="ac-tips" aria-labelledby="ac-tips-title">
        <Reveal className="ac-head">
          <h2 id="ac-tips-title" className="ac-title">{copy.home_24}</h2>
        </Reveal>
        <ol className="ac-tips__list">
          {tips.map((tip, index) => <li key={tip.n}>
            <Reveal delay={index * 60}>
              <span className="ac-tips__n">{tip.n}</span>
              <b className="ac-tips__title">{tip.title}</b>
              <span className="ac-tips__text">{tip.text}</span>
            </Reveal>
          </li>)}
        </ol>
      </section>

      <section id="estudio" className="ac-studio" aria-labelledby="ac-studio-title">
        <div className="ac-studio__photos">
          <Parallax strength={60} mobileStrength={22} className="ac-drift"><img src={photos.estudio} alt={copy.home_25} /></Parallax>
          <img className="ac-studio__small" src={photos.mesa} alt={copy.home_26} />
        </div>
        <Reveal className="ac-studio__copy">
          <p className="ac-kicker">{copy.home_27}</p>
          <h2 id="ac-studio-title" className="ac-title">{copy.home_28}</h2>
          <p>{copy.home_29}</p>
          <a className="ac-btn ac-btn--ink" href="#pinturas">{copy.home_30}</a>
        </Reveal>
      </section>

      <section id="boletin" className="ac-news" aria-labelledby="ac-news-title" data-pagosya-subscribe-block>
        <Reveal className="ac-news__inner">
          <h2 id="ac-news-title" className="ac-news__title">{copy.home_31}</h2>
          <p className="ac-news__text">{copy.home_32}</p>
          <button type="button" className="ac-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="ac-news__field">{copy.home_33}</span>
            <span className="ac-news__submit">{copy.home_34}</span>
          </button>
          <p role="status" className="ac-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
