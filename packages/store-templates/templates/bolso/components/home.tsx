import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const bags = [
  { slot: 'p1', name: copy.home_1, note: copy.home_2, alt: copy.home_3 },
  { slot: 'p2', name: copy.home_4, note: copy.home_5, alt: copy.home_6 },
  { slot: 'p3', name: copy.home_7, note: copy.home_8, alt: copy.home_9 },
  { slot: 'p4', name: copy.home_10, note: copy.home_11, alt: copy.home_12 },
];

const reviews = [
  { quote: copy.home_13, name: copy.home_14, city: copy.home_15 },
  { quote: copy.home_16, name: copy.home_17, city: copy.home_18 },
  { quote: copy.home_19, name: copy.home_20, city: copy.home_21 },
];

function AnimalArt() {
  return <svg className="bo-print__art" viewBox="0 0 120 120" aria-hidden="true">
    <path fill="currentColor" d="M24 44 30 12l22 20c5-1.4 11-1.4 16 0l22-20 6 32c6 9 8 19 5 29-4 17-19 30-41 30S23 90 19 73c-3-10-1-20 5-29Z" />
    <circle cx="44" cy="62" r="6" fill="var(--bo-tile)" /><circle cx="76" cy="62" r="6" fill="var(--bo-tile)" />
    <path fill="var(--bo-tile)" d="M53 76h14l-7 8z" />
  </svg>;
}

function SignArt() {
  return <svg className="bo-print__art" viewBox="0 0 120 120" aria-hidden="true">
    <path fill="currentColor" d="M66 10a50 50 0 1 0 44 70A40 40 0 1 1 66 10Z" />
    <path fill="currentColor" d="m86 20 4.5 11.5L102 36l-11.5 4.5L86 52l-4.5-11.5L70 36l11.5-4.5z" />
  </svg>;
}

function FruitArt() {
  return <svg className="bo-print__art" viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="70" r="42" fill="currentColor" />
    <path d="M60 30c0-9 3-16 9-21" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    <path fill="currentColor" d="M66 26c8-15 30-17 38-9-9 13-27 16-38 9Z" />
    <path d="M40 58a24 24 0 0 1 14-14" fill="none" stroke="var(--bo-tile)" strokeWidth="6" strokeLinecap="round" />
  </svg>;
}

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="bo-hero" aria-labelledby="bo-hero-title">
        <div className="bo-hero__head">
          <p className="bo-kicker">{copy.home_22}</p>
          <h1 id="bo-hero-title" className="bo-hero__title">{copy.home_23}</h1>
        </div>
        <ul className="bo-hero__row">
          {bags.map((bag, index) => <li key={bag.slot}>
            <Reveal delay={index * 60}>
              <a className="bo-bag" href="#mas-vendidos">
                <span className="bo-bag__media"><img src={photos[bag.slot]} alt={bag.alt} /></span>
                <span className="bo-bag__name">{bag.name}</span>
                <span className="bo-bag__note">{bag.note}</span>
              </a>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="mas-vendidos" className="bo-shop" aria-labelledby="bo-shop-title">
        <Reveal className="bo-head">
          <h2 id="bo-shop-title" className="bo-title">{copy.home_24}</h2>
          <p className="bo-head__aside">{copy.home_25}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="bo-card">
            <a className="bo-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del bolso" /></a>
            <h3 className="bo-card__name" data-product-field="name">Bolso</h3>
            <p className="bo-card__price" data-product-field="price" />
            <button type="button" className="bo-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="bo-grid" data-pagosya-catalog />
      </section>

      <section id="estampas" className="bo-prints" aria-labelledby="bo-prints-title">
        <Reveal className="bo-head">
          <h2 id="bo-prints-title" className="bo-title">{copy.home_26}</h2>
          <p className="bo-head__aside">{copy.home_27}</p>
        </Reveal>
        <div className="bo-prints__grid">
          <Reveal>
            <a className="bo-print bo-print--sky" href="#mas-vendidos">
              <AnimalArt />
              <span className="bo-print__name">{copy.home_28}</span>
              <span className="bo-print__note">{copy.home_29}</span>
              <span className="bo-print__go">{copy.home_30}<span aria-hidden="true">→</span></span>
            </a>
          </Reveal>
          <Reveal delay={60}>
            <a className="bo-print bo-print--brick" href="#mas-vendidos">
              <SignArt />
              <span className="bo-print__name">{copy.home_31}</span>
              <span className="bo-print__note">{copy.home_32}</span>
              <span className="bo-print__go">{copy.home_33}<span aria-hidden="true">→</span></span>
            </a>
          </Reveal>
          <Reveal delay={120}>
            <a className="bo-print bo-print--mustard" href="#mas-vendidos">
              <FruitArt />
              <span className="bo-print__name">{copy.home_34}</span>
              <span className="bo-print__note">{copy.home_35}</span>
              <span className="bo-print__go">{copy.home_36}<span aria-hidden="true">→</span></span>
            </a>
          </Reveal>
        </div>
      </section>

      <section id="hecho-a-mano" className="bo-craft" aria-labelledby="bo-craft-title">
        <div className="bo-craft__photo">
          <Parallax strength={90} mobileStrength={30} className="bo-drift"><img src={photos.taller} alt={copy.home_37} /></Parallax>
        </div>
        <Reveal className="bo-craft__copy">
          <p className="bo-kicker">{copy.home_38}</p>
          <h2 id="bo-craft-title" className="bo-title">{copy.home_39}</h2>
          <p className="bo-craft__text">{copy.home_40}{store.name}{copy.home_41}</p>
          <ul className="bo-facts">
            <li><b>{copy.home_42}</b><span>{copy.home_43}</span></li>
            <li><b>{copy.home_44}</b><span>{copy.home_45}</span></li>
            <li><b>{copy.home_46}</b><span>{copy.home_47}</span></li>
          </ul>
          <a className="bo-btn" href="#mas-vendidos">{copy.home_48}</a>
        </Reveal>
      </section>

      <section id="resenas" className="bo-reviews" aria-labelledby="bo-reviews-title">
        <Reveal className="bo-head">
          <h2 id="bo-reviews-title" className="bo-title">{copy.home_49}</h2>
          <p className="bo-head__aside">{copy.home_50}</p>
        </Reveal>
        <div className="bo-reviews__grid">
          <figure className="bo-reviews__photo">
            <img src={photos.calle} alt={copy.home_51} />
            <figcaption>{copy.home_52}</figcaption>
          </figure>
          <div className="bo-quotes">
            {reviews.map(review => <figure key={review.name} className="bo-quote">
              <p className="bo-quote__stars" aria-hidden="true">★★★★★</p>
              <blockquote className="bo-quote__text">{review.quote}</blockquote>
              <figcaption className="bo-quote__who"><b>{review.name}</b> · {review.city}</figcaption>
            </figure>)}
          </div>
        </div>
      </section>

      <section id="boletin" className="bo-news" aria-labelledby="bo-news-title" data-pagosya-subscribe-block>
        <Reveal className="bo-news__inner">
          <h2 id="bo-news-title" className="bo-news__title">{copy.home_53}</h2>
          <p className="bo-news__text">{copy.home_54}</p>
          <button type="button" className="bo-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="bo-news__field">{copy.home_55}</span>
            <span className="bo-news__submit">{copy.home_56}</span>
          </button>
          <p role="status" className="bo-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
