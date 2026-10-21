import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const perks = [
  { name: copy.home_1, text: copy.home_2 },
  { name: copy.home_3, text: copy.home_4 },
  { name: copy.home_5, text: copy.home_6 },
  { name: copy.home_7, text: copy.home_8 },
];

const faqs = [
  { q: copy.home_9, a: copy.home_10 },
  { q: copy.home_11, a: copy.home_12 },
  { q: copy.home_13, a: copy.home_14 },
  { q: copy.home_15, a: copy.home_16 },
];

const reviews = [
  { quote: copy.home_17, who: copy.home_18 },
  { quote: copy.home_19, who: copy.home_20 },
  { quote: copy.home_21, who: copy.home_22 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="ne-hero" aria-labelledby="ne-hero-title">
        <Parallax strength={50} mobileStrength={20} className="ne-hero__bg"><img src={photos.p1} alt={copy.home_23} /></Parallax>
        <div className="ne-hero__copy">
          <h1 id="ne-hero-title" className="ne-hero__title">{store.name}{copy.home_24}</h1>
          <p className="ne-hero__lead">{copy.home_25}</p>
          <a className="ne-btn" href="#vendidos">{copy.home_26}</a>
        </div>
      </section>

      <section id="vendidos" className="ne-shop" aria-labelledby="ne-shop-title">
        <Reveal className="ne-head">
          <h2 id="ne-shop-title" className="ne-title">{copy.home_27}</h2>
          <p className="ne-head__aside">{copy.home_28}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ne-card">
            <a className="ne-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="ne-card__name" data-product-field="name">Producto</h3>
            <p className="ne-card__price" data-product-field="price" />
            <button type="button" className="ne-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ne-grid" data-pagosya-catalog />
      </section>

      <section id="beneficios" className="ne-perks" aria-label="Beneficios">
        <div className="ne-perks__grid">
          {perks.map((perk, index) => <Reveal key={perk.name} delay={index * 50}>
            <div className="ne-perk"><b>{perk.name}</b><span>{perk.text}</span></div>
          </Reveal>)}
        </div>
      </section>

      <section id="destacado" className="ne-feat" aria-labelledby="ne-feat-title">
        <img className="ne-feat__photo" src={photos.p2} alt={copy.home_29} />
        <Reveal className="ne-feat__copy">
          <p className="ne-kicker">{copy.home_30}</p>
          <h2 id="ne-feat-title" className="ne-title">{copy.home_31}</h2>
          <p>{copy.home_32}</p>
          <a className="ne-btn" href="#vendidos">{copy.home_33}</a>
        </Reveal>
      </section>

      <section id="historia" className="ne-story" aria-labelledby="ne-story-title">
        <img className="ne-story__photo" src={photos.equipo} alt={copy.home_34} />
        <Reveal className="ne-story__copy">
          <h2 id="ne-story-title" className="ne-title">{copy.home_35}</h2>
          <p>{copy.home_36}</p>
          <img className="ne-story__parcel" src={photos.empaque} alt={copy.home_37} />
        </Reveal>
      </section>

      <section id="preguntas" className="ne-faq" aria-labelledby="ne-faq-title">
        <Reveal className="ne-head">
          <h2 id="ne-faq-title" className="ne-title">{copy.home_38}</h2>
        </Reveal>
        <div className="ne-faq__list">
          {faqs.map(item => <details key={item.q} className="ne-faq__item"><summary>{item.q}</summary><p>{item.a}</p></details>)}
        </div>
      </section>

      <section id="resenas" className="ne-rev" aria-labelledby="ne-rev-title">
        <Reveal className="ne-head">
          <h2 id="ne-rev-title" className="ne-title">{copy.home_39}</h2>
        </Reveal>
        <div className="ne-rev__grid">
          {reviews.map((rev, index) => <Reveal key={rev.who} delay={index * 60}>
            <figure className="ne-rev__item"><blockquote>{rev.quote}</blockquote><figcaption>{rev.who}</figcaption></figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="ne-news" aria-labelledby="ne-news-title" data-pagosya-subscribe-block>
        <Reveal className="ne-news__inner">
          <h2 id="ne-news-title" className="ne-news__title">{copy.home_40}</h2>
          <p className="ne-news__text">{copy.home_41}</p>
          <button type="button" className="ne-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="ne-news__field">{copy.home_42}</span>
            <span className="ne-news__submit">{copy.home_43}</span>
          </button>
          <p role="status" className="ne-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
