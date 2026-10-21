import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { photos, copy } from './store-data';

const families = [
  { name: copy.home_1, notes: copy.home_2 },
  { name: copy.home_3, notes: copy.home_4 },
  { name: copy.home_5, notes: copy.home_6 },
  { name: copy.home_7, notes: copy.home_8 },
];

const steps = [
  { n: '1', title: copy.home_9, text: copy.home_10 },
  { n: '2', title: copy.home_11, text: copy.home_12 },
  { n: '3', title: copy.home_13, text: copy.home_14 },
];

const reviews = [
  { quote: copy.home_15, who: copy.home_16 },
  { quote: copy.home_17, who: copy.home_18 },
  { quote: copy.home_19, who: copy.home_20 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="in-hero" aria-labelledby="in-hero-title">
        <div className="in-hero__copy">
          <p className="in-hero__kicker">{copy.home_21}</p>
          <h1 id="in-hero-title" className="in-hero__title">{copy.home_22}</h1>
          <p className="in-hero__lead">{copy.home_23}</p>
          <a className="in-btn" href="#tes">{copy.home_24}</a>
        </div>
        <img className="in-hero__photo" src={photos.p1} alt={copy.home_25} />
      </section>

      <section id="tes" className="in-shop" aria-labelledby="in-shop-title">
        <Reveal className="in-head">
          <h2 id="in-shop-title" className="in-title">{copy.home_26}</h2>
          <p className="in-head__aside">{copy.home_27}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="in-card">
            <a className="in-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="in-card__name" data-product-field="name">Producto</h3>
            <p className="in-card__price" data-product-field="price" />
            <button type="button" className="in-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="in-grid" data-pagosya-catalog />
      </section>

      <section id="familias" className="in-fam" aria-labelledby="in-fam-title">
        <Reveal className="in-head">
          <h2 id="in-fam-title" className="in-title">{copy.home_28}</h2>
        </Reveal>
        <div className="in-fam__grid">
          {families.map((fam, index) => <Reveal key={fam.name} delay={index * 60}>
            <div className="in-fam__item"><b>{fam.name}</b><span>{fam.notes}</span></div>
          </Reveal>)}
        </div>
      </section>

      <section id="ceremonia" className="in-cer" aria-labelledby="in-cer-title">
        <div className="in-cer__frame">
          <Parallax strength={50} mobileStrength={20} className="in-drift"><img className="in-cer__photo" src={photos.ceremonia} alt={copy.home_29} /></Parallax>
        </div>
        <Reveal className="in-cer__copy">
          <h2 id="in-cer-title" className="in-title">{copy.home_30}</h2>
          <ol className="in-cer__list">
            {steps.map(step => <li key={step.n}><span className="in-cer__n">{step.n}</span><span><b>{step.title}</b><br />{step.text}</span></li>)}
          </ol>
        </Reveal>
      </section>

      <section id="regalo" className="in-gift" aria-labelledby="in-gift-title">
        <Reveal className="in-gift__inner">
          <h2 id="in-gift-title" className="in-gift__title">{copy.home_31}</h2>
          <p className="in-gift__text">{copy.home_32}</p>
          <a className="in-btn in-btn--light" href="#tes">{copy.home_33}</a>
        </Reveal>
        <img className="in-gift__photo" src={photos.p2} alt={copy.home_34} />
      </section>

      <section id="suscripcion" className="in-sub" aria-labelledby="in-sub-title">
        <div className="in-sub__photos">
          <img src={photos.p3} alt={copy.home_35} />
          <img src={photos.p4} alt={copy.home_36} />
        </div>
        <Reveal className="in-sub__copy">
          <h2 id="in-sub-title" className="in-title">{copy.home_37}</h2>
          <p>{copy.home_38}</p>
          <a className="in-btn" href="#tes">{copy.home_39}</a>
        </Reveal>
      </section>

      <section id="resenas" className="in-rev" aria-labelledby="in-rev-title">
        <Reveal className="in-head">
          <h2 id="in-rev-title" className="in-title">{copy.home_40}</h2>
        </Reveal>
        <div className="in-rev__grid">
          {reviews.map((rev, index) => <Reveal key={rev.who} delay={index * 60}>
            <figure className="in-rev__item"><blockquote>{rev.quote}</blockquote><figcaption>{rev.who}</figcaption></figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="in-news" aria-labelledby="in-news-title" data-pagosya-subscribe-block>
        <Reveal className="in-news__inner">
          <h2 id="in-news-title" className="in-news__title">{copy.home_41}</h2>
          <p className="in-news__text">{copy.home_42}</p>
          <button type="button" className="in-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="in-news__field">{copy.home_43}</span>
            <span className="in-news__submit">{copy.home_44}</span>
          </button>
          <p role="status" className="in-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
