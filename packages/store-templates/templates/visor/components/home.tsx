import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const bodies = [
  { name: 'Compacta', sensor: '1 pulgada', video: '4K a 30 fps', weight: '300 g', fit: 'Viajes y calle' },
  { name: 'Mirrorless', sensor: 'APS-C 26 MP', video: '4K a 60 fps', weight: '520 g', fit: 'Retrato y familia' },
  { name: 'Profesional', sensor: 'Full frame 45 MP', video: '6K a 30 fps', weight: '740 g', fit: 'Bodas y estudio' },
];

const lenses = [
  { mm: '24 mm', name: 'Gran angular', note: 'Paisaje, arquitectura y calles' },
  { mm: '35 mm', name: 'Reportaje', note: 'La mirada más natural' },
  { mm: '50 mm', name: 'Estándar', note: 'Retrato y uso diario' },
  { mm: '85 mm', name: 'Retrato', note: 'Fondos suaves y rostros limpios' },
];

const guides = [
  { title: 'Cómo elegir tu primera cámara', text: 'Tres preguntas simples para saber qué sensor y qué cuerpo necesitas de verdad.' },
  { title: 'Lentes fijos vs. zoom', text: 'Cuándo conviene uno y cuándo el otro, con ejemplos reales de cada distancia.' },
  { title: 'Cuidar tu equipo en la altura', text: 'Polvo, frío y humedad: cómo guardar y limpiar tu cámara en La Paz y el altiplano.' },
];

const reviews = [
  { quote: 'Me ayudaron a elegir sin venderme de más. La cámara llegó calibrada y con la batería cargada.', name: 'Alejandro', city: 'La Paz' },
  { quote: 'Llevé mi lente al taller y me lo devolvieron limpio en dos días. Trato serio y explicado.', name: 'Gabriela', city: 'Cochabamba' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="vi-hero" aria-labelledby="vi-hero-title">
        <div className="vi-hero__copy">
          <p className="vi-kicker">Cámaras y lentes</p>
          <h1 id="vi-hero-title" className="vi-hero__title">La experiencia de cámara absoluta</h1>
          <p className="vi-hero__lead">Instrumentos de precisión para quien cuenta historias con imágenes. Elegidos, probados y calibrados en {store.name}.</p>
          <div className="vi-hero__actions">
            <a className="vi-btn" href="#equipo">Comprar ahora</a>
            <a className="vi-btn vi-btn--ghost" href="#comparar">Comparar modelos</a>
          </div>
        </div>
        <div className="vi-hero__stage">
          <img className="vi-hero__camera" src={photos.p1} alt="Cámara mirrorless negra con un lente grande sobre un pedestal blanco" />
          <aside className="vi-inset" aria-label="Modelo destacado">
            <img src={photos.p2} alt="Cámara compacta plateada sobre fondo gris claro" />
            <div>
              <p className="vi-inset__name">Compacta plateada</p>
              <p className="vi-inset__note">Lente fijo · 4K</p>
              <a className="vi-inset__link" href="#equipo">Ver precio →</a>
            </div>
          </aside>
        </div>
      </section>

      <section id="equipo" className="vi-shop" aria-labelledby="vi-shop-title">
        <Reveal className="vi-head">
          <h2 id="vi-shop-title" className="vi-title">Equipo disponible</h2>
          <p className="vi-head__aside">Cuerpos, lentes y accesorios revisados uno por uno.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="vi-card">
            <a className="vi-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="vi-card__name" data-product-field="name">Producto</h3>
            <p className="vi-card__price" data-product-field="price" />
            <button type="button" className="vi-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="vi-grid" data-pagosya-catalog />
      </section>

      <section id="comparar" className="vi-compare" aria-labelledby="vi-compare-title">
        <Reveal className="vi-head">
          <h2 id="vi-compare-title" className="vi-title">Compara tres cuerpos</h2>
        </Reveal>
        <div className="vi-table" role="table" aria-label="Comparación de cuerpos">
          <div className="vi-table__row vi-table__row--head" role="row">
            <span role="columnheader" />
            {bodies.map(body => <span key={body.name} role="columnheader">{body.name}</span>)}
          </div>
          {([['Sensor', 'sensor'], ['Video', 'video'], ['Peso', 'weight'], ['Ideal para', 'fit']] as const).map(([label, key]) => <div key={key} className="vi-table__row" role="row">
            <span role="rowheader">{label}</span>
            {bodies.map(body => <span key={body.name} role="cell">{body[key]}</span>)}
          </div>)}
        </div>
      </section>

      <section id="lentes" className="vi-lenses" aria-labelledby="vi-lenses-title">
        <Reveal className="vi-head">
          <h2 id="vi-lenses-title" className="vi-title">Elige tu distancia</h2>
          <p className="vi-head__aside">Cada focal cuenta la historia de otra manera.</p>
        </Reveal>
        <div className="vi-lenses__grid">
          <div className="vi-lenses__photo"><img src={photos.p3} alt="Lente fijo negro de pie sobre fondo blanco" /></div>
          <ul className="vi-lenses__list">
            {lenses.map((lens, index) => <li key={lens.mm}>
              <Reveal delay={index * 60}>
                <a className="vi-lens" href="#equipo">
                  <span className="vi-lens__mm">{lens.mm}</span>
                  <span className="vi-lens__name">{lens.name}</span>
                  <span className="vi-lens__note">{lens.note}</span>
                </a>
              </Reveal>
            </li>)}
          </ul>
        </div>
      </section>

      <section id="taller" className="vi-lab" aria-labelledby="vi-lab-title">
        <div className="vi-lab__photo">
          <Parallax strength={60} mobileStrength={22} className="vi-drift"><img src={photos.taller} alt="Técnico limpiando el sensor de una cámara en un banco de trabajo luminoso" /></Parallax>
        </div>
        <Reveal className="vi-lab__copy">
          <p className="vi-kicker vi-kicker--dark">Servicio técnico</p>
          <h2 id="vi-lab-title" className="vi-title">Calibración y limpieza en La Paz</h2>
          <p>Limpieza de sensor, calibración de enfoque y revisión general. Tu equipo vuelve como salió de fábrica.</p>
          <a className="vi-btn" href="#guias">Ver cómo funciona</a>
        </Reveal>
      </section>

      <section id="guias" className="vi-guides" aria-labelledby="vi-guides-title">
        <Reveal className="vi-head">
          <h2 id="vi-guides-title" className="vi-title">Guías rápidas</h2>
        </Reveal>
        <div className="vi-guides__grid">
          {guides.map((guide, index) => <Reveal key={guide.title} delay={index * 60}>
            <article className="vi-guide">
              <h3 className="vi-guide__title">{guide.title}</h3>
              <p className="vi-guide__text">{guide.text}</p>
              <a className="vi-guide__link" href="#equipo">Leer guía →</a>
            </article>
          </Reveal>)}
        </div>
      </section>

      <section id="resenas" className="vi-reviews" aria-labelledby="vi-reviews-title">
        <Reveal className="vi-head">
          <h2 id="vi-reviews-title" className="vi-title">Fotógrafos que ya compraron</h2>
        </Reveal>
        <div className="vi-reviews__grid">
          <figure className="vi-reviews__photo"><img src={photos.calle} alt="Fotógrafo tomando fotos en una calle con mercado" /></figure>
          <div className="vi-quotes">
            {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
              <figure className="vi-quote">
                <blockquote>{review.quote}</blockquote>
                <figcaption><b>{review.name}</b> · {review.city}</figcaption>
              </figure>
            </Reveal>)}
          </div>
        </div>
      </section>

      <section id="boletin" className="vi-news" aria-labelledby="vi-news-title" data-pagosya-subscribe-block>
        <Reveal className="vi-news__inner">
          <h2 id="vi-news-title" className="vi-news__title">Ofertas y llegadas, sin ruido</h2>
          <p className="vi-news__text">Te avisamos cuando llegue un cuerpo o un lente que buscabas.</p>
          <button type="button" className="vi-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="vi-news__field">Tu correo electrónico</span>
            <span className="vi-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="vi-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
