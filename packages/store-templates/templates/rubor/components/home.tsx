import { BeforeAfter, Parallax, Reveal } from '@pagosya/ui';
import Shell, { Wordmark, wordmarkFit } from './Shell';
import { store, photos, copy } from './store-data';

const steps = [
  { title: 'limpia', when: copy.home_1, text: copy.home_2 },
  { title: 'hidrata', when: copy.home_3, text: copy.home_4 },
  { title: 'protege', when: copy.home_5, text: copy.home_6 },
];

const ingredients = [
  { name: 'niacinamida', for: copy.home_7, text: copy.home_8 },
  { name: copy.home_9, for: copy.home_10, text: copy.home_11 },
  { name: copy.home_12, for: copy.home_13, text: copy.home_14 },
  { name: 'centella', for: copy.home_15, text: copy.home_16 },
  { name: 'ceramidas', for: copy.home_17, text: copy.home_18 },
  { name: copy.home_19, for: copy.home_20, text: copy.home_21 },
];

const reviews = [
  { quote: copy.home_22, name: copy.home_23, skin: copy.home_24, city: copy.home_25 },
  { quote: copy.home_26, name: copy.home_27, skin: copy.home_28, city: copy.home_29 },
  { quote: copy.home_30, name: copy.home_31, skin: copy.home_32, city: copy.home_33 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="piel" className="ru-hero" aria-labelledby="ru-hero-title">
        <img className="ru-hero__photo" src={photos.hero} alt={copy.home_34} />
        <div className="ru-hero__top">
          <p className="ru-hero__claim">{copy.home_35}</p>
          <a className="ru-pill ru-pill--red" href="#mas-queridos">{copy.home_36}</a>
        </div>
        <h1 id="ru-hero-title" className="ru-hero__name" style={wordmarkFit(store.name)}><Wordmark className="ru-hero__word" /></h1>
      </section>

      <section id="rutina" className="ru-routine" aria-labelledby="ru-routine-title">
        <Reveal className="ru-head">
          <h2 id="ru-routine-title" className="ru-title">{copy.home_37}<span className="ru-dot">.</span></h2>
          <p className="ru-head__aside">{copy.home_38}</p>
        </Reveal>
        <ol className="ru-steps">
          {steps.map((step, index) => <li key={step.title} className={`ru-step ru-step--${index + 1}`}>
            <Reveal delay={index * 70} className="ru-step__inner">
              <p className="ru-step__n" aria-hidden="true">{String(index + 1).padStart(2, '0')}</p>
              <p className="ru-step__when">{step.when}</p>
              <h3 className="ru-step__title">{step.title}<span className="ru-dot">.</span></h3>
              <p className="ru-step__text">{step.text}</p>
            </Reveal>
          </li>)}
        </ol>
      </section>

      <section id="mas-queridos" className="ru-shop" aria-labelledby="ru-shop-title">
        <Reveal className="ru-head">
          <h2 id="ru-shop-title" className="ru-title">{copy.home_39}<span className="ru-dot">.</span></h2>
          <p className="ru-head__aside">{copy.home_40}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ru-card">
            <a className="ru-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="ru-card__body">
              <h3 className="ru-card__name" data-product-field="name">Producto</h3>
              <p className="ru-card__price" data-product-field="price" />
            </div>
            <button type="button" className="ru-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ru-grid" data-pagosya-catalog />
      </section>

      <section id="ingredientes" className="ru-glossary" aria-labelledby="ru-glossary-title">
        <div className="ru-glossary__photo">
          <Parallax strength={120} mobileStrength={40} className="ru-drift"><img src={photos.textura} alt={copy.home_41} /></Parallax>
        </div>
        <div className="ru-glossary__body">
          <Reveal>
            <p className="ru-kicker">{copy.home_42}</p>
            <h2 id="ru-glossary-title" className="ru-title">{copy.home_43}<span className="ru-dot">.</span></h2>
            <p className="ru-glossary__lead">{copy.home_44}</p>
          </Reveal>
          <dl className="ru-terms">
            {ingredients.map((item, index) => <Reveal key={item.name} delay={(index % 2) * 60} className="ru-term">
              <dt><span className="ru-term__name">{item.name}</span><span className="ru-term__for">{item.for}</span></dt>
              <dd>{item.text}</dd>
            </Reveal>)}
          </dl>
        </div>
      </section>

      <section id="antes-despues" className="ru-compare" aria-labelledby="ru-compare-title">
        <Reveal className="ru-compare__copy">
          <p className="ru-kicker">{copy.home_45}</p>
          <h2 id="ru-compare-title" className="ru-title">{copy.home_46}<span className="ru-dot">.</span></h2>
          <p className="ru-compare__text">{copy.home_47}</p>
          <p className="ru-compare__note">{copy.home_48}</p>
          <a className="ru-pill ru-pill--wine" href="#mas-queridos">{copy.home_49}</a>
        </Reveal>
        <div className="ru-compare__frame">
          <BeforeAfter
            before={{ src: photos.antes, alt: 'Mejilla con la piel seca y descamada, antes de la rutina' }}
            after={{ src: photos.despues, alt: 'La misma mejilla con la piel hidratada y luminosa, después de la rutina' }}
            label={copy.home_50}
            initial={50}
            aspect="4/5"
          />
        </div>
      </section>

      <section id="resenas" className="ru-reviews" aria-labelledby="ru-reviews-title">
        <Reveal className="ru-head">
          <h2 id="ru-reviews-title" className="ru-title">{copy.home_51}<span className="ru-dot">.</span></h2>
          <p className="ru-head__aside">{copy.home_52}</p>
        </Reveal>
        <div className="ru-quotes">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 70} className="ru-quote">
            <figure>
              <p className="ru-quote__stars" aria-label="5 de 5 estrellas">★★★★★</p>
              <blockquote className="ru-quote__text">{review.quote}</blockquote>
              <figcaption className="ru-quote__who"><b>{review.name}</b><span>{review.city}</span><span className="ru-quote__skin">{review.skin}</span></figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="ru-news" aria-labelledby="ru-news-title" data-pagosya-subscribe-block>
        <Reveal className="ru-news__inner">
          <h2 id="ru-news-title" className="ru-news__title">{copy.home_53}<span className="ru-dot">.</span></h2>
          <p className="ru-news__text">{copy.home_54}</p>
          <button type="button" className="ru-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="ru-news__field">{copy.home_55}</span>
            <span className="ru-news__submit">{copy.home_56}</span>
          </button>
          <p role="status" className="ru-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
