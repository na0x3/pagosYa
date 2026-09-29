import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const rituals = [
  { slot: 'bano', name: 'Baño', note: 'Jabones en barra y aceites', alt: 'Jabón natural sobre una jabonera de madera junto al lavamanos' },
  { slot: 'cocina', name: 'Cocina', note: 'Cepillos y jabón de loza', alt: 'Cepillo de madera y jabón de loza junto al lavaplatos' },
  { slot: 'limpieza', name: 'Limpieza', note: 'Rociadores y esponjas vegetales', alt: 'Rociador de vidrio, esponja vegetal y paño de algodón junto a la ventana' },
];

const figures = [
  { before: '', em: '0', after: 'plástico', note: 'Papel, vidrio y lata. Nada que dure siglos en un basural.' },
  { before: '', em: '100%', after: 'compostable', note: 'Envolturas de papel semilla y cartón sin tintas.' },
  { before: 'Hecho en', em: 'Cochabamba', after: '', note: 'Mezclado y cortado a mano en pequeñas tandas.' },
];

const steps = [
  { title: 'Trae tu frasco', text: 'O llévate uno de vidrio la primera vez; es tuyo para siempre.' },
  { title: 'Lo llenamos al peso', text: 'Jabón líquido, lavavajilla y detergente, a granel.' },
  { title: 'Pagas menos', text: 'Cada recarga cuesta menos que un envase nuevo.' },
];

const reviews = [
  { quote: 'Hace un año que no compro jabón en botella de plástico. Las barras de avena duran semanas, la piel se siente suave y el baño huele a limpio de verdad, no a perfume fuerte.', name: 'Mariana', city: 'Cochabamba' },
  { quote: 'Voy cada mes con mis frascos a recargar el lavavajilla. Es más barato, me atienden con calma y me gusta saber que no estoy llenando la basura de envases que nadie recicla.', name: 'Rodrigo', city: 'Quillacollo' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="origen" className="br-hero" aria-labelledby="br-hero-title">
        <img className="br-hero__photo" src={photos.hero} alt="Jabones naturales y una botella de vidrio sobre piedra gris" />
        <div className="br-hero__copy">
          <h1 id="br-hero-title" className="br-hero__title">{store.name}</h1>
          <p className="br-hero__text">Esenciales para el hogar, hechos sin plástico.</p>
          <a className="br-btn br-btn--cream" href="#esenciales">Ver esenciales</a>
        </div>
      </section>

      <section id="esenciales" className="br-shop" aria-labelledby="br-shop-title">
        <Reveal className="br-head">
          <p className="br-kicker">Esenciales</p>
          <h2 id="br-shop-title" className="br-title">Lo de todos los días, <em>sin envase de más</em></h2>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="br-card">
            <a className="br-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="br-card__body">
              <h3 className="br-card__name" data-product-field="name">Producto</h3>
              <p className="br-card__price" data-product-field="price" />
            </div>
            <button type="button" className="br-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="br-grid" data-pagosya-catalog />
      </section>

      <section id="rituales" className="br-rituals" aria-labelledby="br-rituals-title">
        <Reveal className="br-head br-head--center">
          <p className="br-kicker">Rituales</p>
          <h2 id="br-rituals-title" className="br-title">Un cambio pequeño en cada rincón</h2>
        </Reveal>
        <div className="br-rituals__rail">
          {rituals.map((ritual, index) => <Reveal key={ritual.slot} delay={index * 80} className="br-rituals__item">
            <a className="br-tile" href="#esenciales">
              <img src={photos[ritual.slot]} alt={ritual.alt} />
              <span className="br-tile__label">
                <span className="br-tile__name">{ritual.name}</span>
                <span className="br-tile__note">{ritual.note}</span>
              </span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="sin-plastico" className="br-figures" aria-labelledby="br-figures-title">
        <h2 id="br-figures-title" className="br-figures__title">Nuestra promesa, en tres cifras</h2>
        <ul className="br-figures__list">
          {figures.map((figure, index) => <li key={figure.em}>
            <Reveal delay={index * 80} className="br-figure">
              <p className="br-figure__big">{figure.before} <em>{figure.em}</em> {figure.after}</p>
              <p className="br-figure__note">{figure.note}</p>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="recarga" className="br-refill" aria-labelledby="br-refill-title">
        <div className="br-refill__photo">
          <Parallax strength={70} mobileStrength={26} className="br-drift"><img src={photos.recarga} alt="Manos rellenando un frasco de vidrio con jabón líquido desde un bidón" /></Parallax>
        </div>
        <Reveal className="br-refill__copy">
          <p className="br-kicker">Programa de recarga</p>
          <h2 id="br-refill-title" className="br-title">Trae tu frasco, <em>lo llenamos</em></h2>
          <p className="br-refill__text">En {store.name} el envase se usa una y otra vez. Pasa por nuestra estación de recarga o pide tu recarga con el pedido y te llevamos el bidón.</p>
          <ol className="br-steps">
            {steps.map((step, index) => <li key={step.title}>
              <span className="br-steps__n" aria-hidden="true">{index + 1}</span>
              <span><b>{step.title}</b><span>{step.text}</span></span>
            </li>)}
          </ol>
          <a className="br-btn" href="#esenciales">Ver recargas</a>
        </Reveal>
      </section>

      <section id="resenas" className="br-reviews" aria-labelledby="br-reviews-title">
        <Reveal className="br-head br-head--center">
          <p className="br-kicker">Opiniones</p>
          <h2 id="br-reviews-title" className="br-title">Casas que ya se pasaron</h2>
        </Reveal>
        <div className="br-reviews__grid">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 80} className="br-quote">
            <figure>
              <span className="br-quote__mark" aria-hidden="true">“</span>
              <blockquote className="br-quote__text">{review.quote}</blockquote>
              <figcaption className="br-quote__who"><b>{review.name}</b> · {review.city}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="br-news" aria-labelledby="br-news-title" data-pagosya-subscribe-block>
        <Reveal className="br-news__inner">
          <h2 id="br-news-title" className="br-news__title">Consejos para una casa con menos basura</h2>
          <p className="br-news__text">Una carta al mes con recetas de limpieza, días de recarga y lanzamientos. Nada más.</p>
          <button type="button" className="br-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="br-news__field">Tu correo electrónico</span>
            <span className="br-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="br-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
