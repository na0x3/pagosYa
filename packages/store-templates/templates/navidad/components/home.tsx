import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { photos, copy } from './store-data';

const rooms = [
  { name: copy.home_1, text: copy.home_2, photo: 'p1' as const, alt: copy.home_3 },
  { name: copy.home_4, text: copy.home_5, photo: 'mesa' as const, alt: copy.home_6 },
  { name: copy.home_7, text: copy.home_8, photo: 'puerta' as const, alt: copy.home_9 },
];

const steps = [
  { date: '10 dic', title: copy.home_10, text: copy.home_11 },
  { date: '13 dic', title: copy.home_12, text: copy.home_13 },
  { date: '20 dic', title: copy.home_14, text: copy.home_15 },
];

const reviews = [
  { quote: copy.home_16, who: copy.home_17 },
  { quote: copy.home_18, who: copy.home_19 },
  { quote: copy.home_20, who: copy.home_21 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="na-hero" aria-labelledby="na-hero-title">
        <Parallax strength={50} mobileStrength={20} className="na-hero__bg"><img src={photos.p1} alt={copy.home_22} /></Parallax>
        <div className="na-hero__copy">
          <p className="na-hero__caption">{copy.home_23}</p>
          <h1 id="na-hero-title" className="na-hero__title">{copy.home_24}</h1>
          <a className="na-btn" href="#adornos">{copy.home_25}</a>
        </div>
        <div className="na-hero__cards">
          <a className="na-hero__card" href="#adornos"><img src={photos.p2} alt={copy.home_26} /></a>
          <a className="na-hero__card" href="#adornos"><img src={photos.p3} alt={copy.home_27} /></a>
          <a className="na-hero__card" href="#adornos"><img src={photos.p4} alt={copy.home_28} /></a>
        </div>
      </section>

      <section id="adornos" className="na-shop" aria-labelledby="na-shop-title">
        <Reveal className="na-head">
          <h2 id="na-shop-title" className="na-title">{copy.home_29}</h2>
          <p className="na-head__aside">{copy.home_30}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="na-card">
            <a className="na-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="na-card__name" data-product-field="name">Producto</h3>
            <p className="na-card__price" data-product-field="price" />
            <button type="button" className="na-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="na-grid" data-pagosya-catalog />
      </section>

      <section id="ambientes" className="na-rooms" aria-labelledby="na-rooms-title">
        <Reveal className="na-head">
          <h2 id="na-rooms-title" className="na-title">{copy.home_31}</h2>
        </Reveal>
        <div className="na-rooms__grid">
          {rooms.map((room, index) => <Reveal key={room.name} delay={index * 60}>
            <a className="na-room" href="#adornos">
              <img src={photos[room.photo]} alt={room.alt} />
              <span><b>{room.name}</b>{room.text}</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="regalos" className="na-gifts" aria-labelledby="na-gifts-title">
        <Reveal className="na-gifts__inner">
          <h2 id="na-gifts-title" className="na-gifts__title">{copy.home_32}</h2>
          <p className="na-gifts__text">{copy.home_33}</p>
          <a className="na-btn na-btn--gold" href="#adornos">{copy.home_34}</a>
        </Reveal>
      </section>

      <section id="envios" className="na-ship" aria-labelledby="na-ship-title">
        <Reveal className="na-head">
          <h2 id="na-ship-title" className="na-title">{copy.home_35}</h2>
        </Reveal>
        <ol className="na-ship__list">
          {steps.map((step, index) => <li key={step.date}>
            <Reveal delay={index * 60}>
              <span className="na-ship__date">{step.date}</span>
              <b>{step.title}</b>
              <span>{step.text}</span>
            </Reveal>
          </li>)}
        </ol>
      </section>

      <section id="resenas" className="na-rev" aria-labelledby="na-rev-title">
        <Reveal className="na-head">
          <h2 id="na-rev-title" className="na-title">{copy.home_36}</h2>
        </Reveal>
        <div className="na-rev__grid">
          {reviews.map((rev, index) => <Reveal key={rev.who} delay={index * 60}>
            <figure className="na-rev__item"><blockquote>{rev.quote}</blockquote><figcaption>{rev.who}</figcaption></figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="na-news" aria-labelledby="na-news-title" data-pagosya-subscribe-block>
        <Reveal className="na-news__inner">
          <h2 id="na-news-title" className="na-news__title">{copy.home_37}</h2>
          <p className="na-news__text">{copy.home_38}</p>
          <button type="button" className="na-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="na-news__field">{copy.home_39}</span>
            <span className="na-news__submit">{copy.home_40}</span>
          </button>
          <p role="status" className="na-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
