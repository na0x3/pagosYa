import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const ingredients = [
  { slot: 'p2', name: 'Avena', note: 'Suaviza y calma la piel', alt: 'Jabón redondo de avena sobre piedra' },
  { slot: 'p3', name: 'Cera de abeja', note: 'Nutre y protege', alt: 'Vela de cera de abeja en una taza de barro' },
  { slot: 'p1', name: 'Coca', note: 'Hoja tradicional, aroma fresco', alt: 'Barras de jabón apiladas sobre travertino' },
  { slot: 'p4', name: 'Lavanda', note: 'Relaja al final del día', alt: 'Jabón de lavanda con ramitas secas' },
];

const ritual = [
  { n: '1', title: 'Humedece', text: 'Moja el jabón con agua tibia hasta que empiece a soltar espuma suave.' },
  { n: '2', title: 'Masajea', text: 'Frota con las manos o una esponja de fibra, sin prisa, durante un minuto.' },
  { n: '3', title: 'Enjuaga y seca', text: 'Deja que el jabón se seque en una jabonera con desagüe: dura el doble.' },
];

const reviews = [
  { quote: 'Mi piel sensible por fin descansa. El de avena es el único que puedo usar en la cara.', name: 'Mariana', city: 'La Paz' },
  { quote: 'La vela huele a miel y dura semanas. Regalé tres y todas volvieron por más.', name: 'Roberto', city: 'Sucre' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="sv-hero" aria-labelledby="sv-hero-title">
        <img className="sv-hero__photo" src={photos.p1} alt="Tres barras de jabón artesanal apiladas sobre travertino junto a un cuenco de avena" />
        <div className="sv-hero__copy">
          <p className="sv-kicker">Jabones y velas artesanales</p>
          <h1 id="sv-hero-title" className="sv-hero__title">Tal como la naturaleza lo pensó</h1>
          <a className="sv-btn" href="#productos">Comprar ahora</a>
        </div>
      </section>

      <section id="productos" className="sv-shop" aria-labelledby="sv-shop-title">
        <Reveal className="sv-head">
          <h2 id="sv-shop-title" className="sv-title">Hechos en pequeños lotes</h2>
          <p className="sv-head__aside">Cada tanda se cura durante cuatro semanas antes de llegar a ti.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="sv-card">
            <a className="sv-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="sv-card__name" data-product-field="name">Producto</h3>
            <p className="sv-card__price" data-product-field="price" />
            <button type="button" className="sv-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="sv-grid" data-pagosya-catalog />
      </section>

      <section id="ingredientes" className="sv-ingredients" aria-labelledby="sv-ing-title">
        <Reveal className="sv-head">
          <h2 id="sv-ing-title" className="sv-title">Pocos ingredientes, todos conocidos</h2>
        </Reveal>
        <ul className="sv-ingredients__grid">
          {ingredients.map((item, index) => <li key={item.name}>
            <Reveal delay={index * 60}>
              <span className="sv-ing__photo"><img src={photos[item.slot]} alt={item.alt} /></span>
              <b className="sv-ing__name">{item.name}</b>
              <span className="sv-ing__note">{item.note}</span>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="ritual" className="sv-ritual" aria-labelledby="sv-ritual-title">
        <div className="sv-ritual__photo"><img src={photos.ritual} alt="Manos lavándose con espuma de jabón sobre una palangana de cerámica" /></div>
        <Reveal className="sv-ritual__copy">
          <p className="sv-kicker sv-kicker--dark">El ritual</p>
          <h2 id="sv-ritual-title" className="sv-title">Un minuto para ti</h2>
          <ol className="sv-steps">
            {ritual.map(step => <li key={step.n}>
              <span className="sv-steps__n">{step.n}</span>
              <span><b>{step.title}</b>{step.text}</span>
            </li>)}
          </ol>
        </Reveal>
      </section>

      <section id="historia" className="sv-story" aria-labelledby="sv-story-title">
        <Parallax strength={60} mobileStrength={22} className="sv-drift"><img src={photos.taller} alt="Artesano cortando una barra grande de jabón en un taller pequeño" /></Parallax>
        <Reveal className="sv-story__copy">
          <h2 id="sv-story-title" className="sv-title sv-title--light">Un taller de familia</h2>
          <p>Empezamos en la cocina de casa, probando recetas con lo que crece cerca. Hoy somos cuatro en el taller, y seguimos cortando cada barra a mano.</p>
          <a className="sv-btn sv-btn--light" href="#productos">Conoce los productos</a>
        </Reveal>
      </section>

      <section id="resenas" className="sv-reviews" aria-labelledby="sv-reviews-title">
        <Reveal className="sv-head">
          <h2 id="sv-reviews-title" className="sv-title">Lo que cuentan</h2>
        </Reveal>
        <div className="sv-quotes">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
            <figure className="sv-quote">
              <blockquote>{review.quote}</blockquote>
              <figcaption><b>{review.name}</b> · {review.city}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="sv-news" aria-labelledby="sv-news-title" data-pagosya-subscribe-block>
        <Reveal className="sv-news__inner">
          <h2 id="sv-news-title" className="sv-news__title">Novedades de {store.name}</h2>
          <p className="sv-news__text">Te escribimos cuando sale una tanda nueva. Nada más.</p>
          <button type="button" className="sv-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="sv-news__field">Tu correo electrónico</span>
            <span className="sv-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="sv-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
