import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { photos, copy } from './store-data';

const budgets = [
  { name: copy.home_1, text: copy.home_2 },
  { name: copy.home_3, text: copy.home_4 },
  { name: copy.home_5, text: copy.home_6 },
];

const checklist = [copy.home_7, copy.home_8, copy.home_9, copy.home_10];

const promises = [
  { name: copy.home_11, text: copy.home_12 },
  { name: copy.home_13, text: copy.home_14 },
  { name: copy.home_15, text: copy.home_16 },
];

const reviews = [
  { quote: copy.home_17, who: copy.home_18 },
  { quote: copy.home_19, who: copy.home_20 },
  { quote: copy.home_21, who: copy.home_22 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="au-hero" aria-labelledby="au-hero-title">
        <h1 id="au-hero-title" className="au-sr">{copy.home_23}</h1>
        <div className="au-hero__halves">
          <img src={photos.p1} alt={copy.home_24} />
          <img src={photos.p2} alt={copy.home_25} />
        </div>
        <div className="au-hero__caption">
          <p>{copy.home_26}</p>
          <a className="au-btn" href="#regalos">{copy.home_27}</a>
        </div>
      </section>

      <section id="regalos" className="au-shop" aria-labelledby="au-shop-title">
        <Reveal className="au-head">
          <h2 id="au-shop-title" className="au-title">{copy.home_28}</h2>
          <p className="au-head__aside">{copy.home_29}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="au-card">
            <a className="au-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="au-card__name" data-product-field="name">Producto</h3>
            <p className="au-card__price" data-product-field="price" />
            <button type="button" className="au-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="au-grid" data-pagosya-catalog />
      </section>

      <section id="guia" className="au-guide" aria-labelledby="au-guide-title">
        <Reveal className="au-head">
          <h2 id="au-guide-title" className="au-title">{copy.home_30}</h2>
        </Reveal>
        <div className="au-guide__grid">
          {budgets.map((item, index) => <Reveal key={item.name} delay={index * 60}>
            <a className="au-guide__tile" href="#regalos"><b>{item.name}</b><span>{item.text}</span></a>
          </Reveal>)}
        </div>
      </section>

      <section id="cuarto" className="au-room" aria-labelledby="au-room-title">
        <div className="au-room__frame">
          <Parallax strength={40} mobileStrength={20} className="au-drift"><img src={photos.cuarto} alt={copy.home_31} /></Parallax>
        </div>
        <Reveal className="au-room__copy">
          <h2 id="au-room-title" className="au-title">{copy.home_32}</h2>
          <ul className="au-room__list">{checklist.map(item => <li key={item}>{item}</li>)}</ul>
          <a className="au-btn au-btn--ghost" href="#regalos">{copy.home_33}</a>
        </Reveal>
      </section>

      <section id="filosofia" className="au-phil" aria-labelledby="au-phil-title">
        <Reveal className="au-head">
          <h2 id="au-phil-title" className="au-title">{copy.home_34}</h2>
        </Reveal>
        <div className="au-phil__grid">
          {promises.map((item, index) => <Reveal key={item.name} delay={index * 60}>
            <div className="au-phil__item"><b>{item.name}</b><span>{item.text}</span></div>
          </Reveal>)}
          <img className="au-phil__photo" src={photos.manos} alt={copy.home_35} />
        </div>
      </section>

      <section id="resenas" className="au-rev" aria-labelledby="au-rev-title">
        <Reveal className="au-head">
          <h2 id="au-rev-title" className="au-title">{copy.home_36}</h2>
        </Reveal>
        <div className="au-rev__grid">
          {reviews.map((rev, index) => <Reveal key={rev.who} delay={index * 60}>
            <figure className="au-rev__item"><blockquote>{rev.quote}</blockquote><figcaption>{rev.who}</figcaption></figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="au-news" aria-labelledby="au-news-title" data-pagosya-subscribe-block>
        <Reveal className="au-news__inner">
          <h2 id="au-news-title" className="au-news__title">{copy.home_37}</h2>
          <p className="au-news__text">{copy.home_38}</p>
          <button type="button" className="au-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="au-news__field">{copy.home_39}</span>
            <span className="au-news__submit">{copy.home_40}</span>
          </button>
          <p role="status" className="au-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
