import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const benefits = [
  { title: 'Hidratación profunda', text: 'Ácido hialurónico en tres pesos que retiene agua durante horas.' },
  { title: 'Luminosidad', text: 'Niacinamida y vitamina C que unifican y aclaran el tono.' },
  { title: 'Suavidad', text: 'Manteca de karité y escualano que dejan la piel flexible.' },
];

const actives = [
  { name: 'Ácido hialurónico', note: 'Hidrata sin dejar sensación grasa.' },
  { name: 'Niacinamida', note: 'Calma y equilibra el aspecto de la piel.' },
  { name: 'Vitamina C', note: 'Aporta luminosidad y protege del día a día.' },
  { name: 'Escualano', note: 'Sella la hidratación y suaviza.' },
];

const reviews = [
  { quote: 'La textura es ligera y se absorbe enseguida. Mi piel amaneció más descansada en una semana.', name: 'Daniela', city: 'La Paz' },
  { quote: 'No irrita mi piel sensible. El frasco es precioso y dura muchísimo.', name: 'Mónica', city: 'Santa Cruz' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="pe-hero" aria-labelledby="pe-hero-title">
        <div className="pe-hero__copy">
          <p className="pe-kicker">Nuevo lanzamiento</p>
          <h1 id="pe-hero-title" className="pe-hero__title">El secreto de belleza definitivo</h1>
          <p className="pe-hero__lead">Eleva tu rutina con una fórmula pensada para todo tipo de piel. Desarrollada por {store.name}.</p>
          <a className="pe-btn" href="#productos">Comprar ahora <span aria-hidden="true">→</span></a>
        </div>
        <div className="pe-hero__stage">
          <img className="pe-hero__photo" src={photos.p1} alt="Dos mujeres de piel luminosa mejilla con mejilla a la luz del día" />
          <aside className="pe-card-float" aria-label="Producto destacado">
            <div>
              <p className="pe-card-float__name">Crema Renovación Radiante</p>
              <p className="pe-card-float__note">Fórmula avanzada · Apta para todo tipo de piel</p>
              <a className="pe-card-float__link" href="#estrella">Ver detalles</a>
            </div>
            <img src={photos.p2} alt="Frasco de crema con tapa dorada" />
          </aside>
        </div>
      </section>

      <section id="estrella" className="pe-star" aria-labelledby="pe-star-title">
        <Reveal className="pe-star__photo"><img src={photos.p2} alt="Frasco de crema con tapa dorada sobre un pedestal rosa empolvado" /></Reveal>
        <Reveal className="pe-star__copy" delay={80}>
          <p className="pe-kicker">Producto estrella</p>
          <h2 id="pe-star-title" className="pe-title">Crema Renovación Radiante</h2>
          <ul className="pe-benefits">
            {benefits.map(item => <li key={item.title}><b>{item.title}</b><span>{item.text}</span></li>)}
          </ul>
          <a className="pe-btn" href="#productos">Ver en la tienda</a>
        </Reveal>
      </section>

      <section id="productos" className="pe-shop" aria-labelledby="pe-shop-title">
        <Reveal className="pe-head">
          <h2 id="pe-shop-title" className="pe-title">La rutina completa</h2>
          <p className="pe-head__aside">Tres pasos, sin complicaciones.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="pe-card">
            <a className="pe-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="pe-card__name" data-product-field="name">Producto</h3>
            <p className="pe-card__price" data-product-field="price" />
            <button type="button" className="pe-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="pe-grid" data-pagosya-catalog />
      </section>

      <section id="ingredientes" className="pe-actives" aria-labelledby="pe-actives-title">
        <div className="pe-actives__photo">
          <Parallax strength={50} mobileStrength={20} className="pe-drift"><img src={photos.textura} alt="Una espiral de crema blanca sobre un vidrio, en primer plano" /></Parallax>
        </div>
        <Reveal className="pe-actives__copy">
          <p className="pe-kicker">Activos que sí importan</p>
          <h2 id="pe-actives-title" className="pe-title">Pocos ingredientes, bien elegidos</h2>
          <ul className="pe-actives__list">
            {actives.map((item, index) => <li key={item.name}><span className="pe-actives__n">{index + 1}</span><span><b>{item.name}</b>{item.note}</span></li>)}
          </ul>
        </Reveal>
      </section>

      <section id="resultados" className="pe-results" aria-labelledby="pe-results-title">
        <Reveal className="pe-results__inner">
          <img className="pe-results__photo" src={photos.rutina} alt="Mujer aplicándose crema frente al espejo del baño con luz de mañana" />
          <div>
            <h2 id="pe-results-title" className="pe-title">Tu piel, más luminosa</h2>
            <p className="pe-results__claim">“Noté mi piel más luminosa después de cuatro semanas de uso.”</p>
            <p className="pe-results__note">Opinión de clientas que probaron la fórmula. Los resultados pueden variar según cada piel.</p>
          </div>
        </Reveal>
      </section>

      <section id="resenas" className="pe-reviews" aria-labelledby="pe-reviews-title">
        <Reveal className="pe-head">
          <h2 id="pe-reviews-title" className="pe-title">Lo que cuentan</h2>
        </Reveal>
        <div className="pe-quotes">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
            <figure className="pe-quote">
              <blockquote>{review.quote}</blockquote>
              <figcaption><b>{review.name}</b> · {review.city}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="pe-news" aria-labelledby="pe-news-title" data-pagosya-subscribe-block>
        <Reveal className="pe-news__inner">
          <h2 id="pe-news-title" className="pe-news__title">Sé la primera en probarlo</h2>
          <p className="pe-news__text">Te avisamos de cada lanzamiento y te damos acceso anticipado.</p>
          <button type="button" className="pe-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="pe-news__field">Tu correo electrónico</span>
            <span className="pe-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="pe-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
