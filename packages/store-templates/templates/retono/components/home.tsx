import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { photos, copy } from './store-data';

const ages = [
  { name: copy.home_1, text: copy.home_2, tone: 'mint' },
  { name: copy.home_3, text: copy.home_4, tone: 'sun' },
  { name: copy.home_5, text: copy.home_6, tone: 'coral' },
];

const facts = [
  { title: copy.home_7, text: copy.home_8 },
  { title: copy.home_9, text: copy.home_10 },
  { title: copy.home_11, text: copy.home_12 },
];

const looks = [
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
      <section id="portada" className="rt-hero" aria-labelledby="rt-hero-title">
        <h1 id="rt-hero-title" className="rt-sr">{copy.home_23}</h1>
        <div className="rt-hero__strip">
          <img src={photos.p1} alt={copy.home_24} />
          <img src={photos.p2} alt={copy.home_25} />
          <img src={photos.p3} alt={copy.home_26} />
        </div>
        <div className="rt-hero__card">
          <h2>{copy.home_27}</h2>
          <p>{copy.home_28}</p>
          <a className="rt-btn" href="#ropa">{copy.home_29}</a>
        </div>
      </section>

      <section id="ropa" className="rt-shop" aria-labelledby="rt-shop-title">
        <Reveal className="rt-head">
          <h2 id="rt-shop-title" className="rt-title">{copy.home_30}</h2>
          <p className="rt-head__aside">{copy.home_31}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="rt-card">
            <a className="rt-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="rt-card__name" data-product-field="name">Producto</h3>
            <p className="rt-card__price" data-product-field="price" />
            <button type="button" className="rt-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="rt-grid" data-pagosya-catalog />
      </section>

      <section id="edades" className="rt-ages" aria-labelledby="rt-ages-title">
        <Reveal className="rt-head">
          <h2 id="rt-ages-title" className="rt-title">{copy.home_32}</h2>
        </Reveal>
        <div className="rt-ages__grid">
          {ages.map((age, index) => <Reveal key={age.name} delay={index * 60}>
            <a className={`rt-age rt-age--${age.tone}`} href="#ropa"><b>{age.name}</b><span>{age.text}</span></a>
          </Reveal>)}
        </div>
      </section>

      <section id="algodon" className="rt-cotton" aria-labelledby="rt-cotton-title">
        <div className="rt-cotton__frame">
          <Parallax strength={40} mobileStrength={20} className="rt-drift"><img src={photos.tela} alt={copy.home_33} /></Parallax>
        </div>
        <Reveal className="rt-cotton__copy">
          <h2 id="rt-cotton-title" className="rt-title">{copy.home_34}</h2>
          <ul className="rt-cotton__list">{facts.map(fact => <li key={fact.title}><b>{fact.title}</b><span>{fact.text}</span></li>)}</ul>
        </Reveal>
      </section>

      <section id="looks" className="rt-looks" aria-labelledby="rt-looks-title">
        <Reveal className="rt-head">
          <h2 id="rt-looks-title" className="rt-title">{copy.home_35}</h2>
        </Reveal>
        <div className="rt-looks__grid">
          <img className="rt-looks__photo" src={photos.p4} alt={copy.home_36} />
          <img className="rt-looks__photo" src={photos.parque} alt={copy.home_37} />
          {looks.map((look, index) => <Reveal key={look.name} delay={index * 60}>
            <div className="rt-look"><b>{look.name}</b><span>{look.text}</span></div>
          </Reveal>)}
        </div>
      </section>

      <section id="resenas" className="rt-rev" aria-labelledby="rt-rev-title">
        <Reveal className="rt-head">
          <h2 id="rt-rev-title" className="rt-title">{copy.home_38}</h2>
        </Reveal>
        <div className="rt-rev__grid">
          {reviews.map((rev, index) => <Reveal key={rev.who} delay={index * 60}>
            <figure className="rt-rev__item"><blockquote>{rev.quote}</blockquote><figcaption>{rev.who}</figcaption></figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="rt-news" aria-labelledby="rt-news-title" data-pagosya-subscribe-block>
        <Reveal className="rt-news__inner">
          <h2 id="rt-news-title" className="rt-news__title">{copy.home_39}</h2>
          <p className="rt-news__text">{copy.home_40}</p>
          <button type="button" className="rt-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="rt-news__field">{copy.home_41}</span>
            <span className="rt-news__submit">{copy.home_42}</span>
          </button>
          <p role="status" className="rt-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
