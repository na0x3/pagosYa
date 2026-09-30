import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const practices = [
  { slot: 'p3', name: 'Yoga', note: 'Fluye con la respiración', alt: 'Mujer con leggings verde salvia en una postura de guerrera en un estudio luminoso' },
  { slot: 'p4', name: 'Pilates', note: 'Fuerza desde el centro', alt: 'Manos ajustando una esterilla color arcilla sobre un piso de madera' },
  { slot: 'estudio', name: 'Caminar', note: 'Aire libre y sin prisa', alt: 'Estudio de yoga luminoso con esterillas enrolladas y plantas' },
];

const classes = [
  { day: 'Lunes', time: '07:00', name: 'Vinyasa suave', room: 'Sala Sol' },
  { day: 'Miércoles', time: '19:00', name: 'Pilates de suelo', room: 'Sala Luna' },
  { day: 'Sábado', time: '09:30', name: 'Yoga restaurativo', room: 'Sala Sol' },
];

const reviews = [
  { quote: 'Las leggings no se transparentan y no se caen. Las uso para yoga y para ir al mercado.', name: 'Carla', city: 'La Paz' },
  { quote: 'La tela es suave y respira. Después de seis meses de lavarlas sigue igual.', name: 'Julieta', city: 'Cochabamba' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="as-hero" aria-labelledby="as-hero-title">
        <div className="as-hero__copy">
          <p className="as-hero__label">Ropa de movimiento</p>
          <h1 id="as-hero-title" className="as-hero__title">Muévete con intención</h1>
          <p className="as-hero__text">Prendas de tela elástica y respirable, cortadas para acompañarte en el tapete y fuera de él. Diseñadas en {store.name}.</p>
          <a className="as-btn" href="#prendas">Comprar</a>
          <a className="as-tile" href="#prendas" aria-label="Ver el conjunto destacado">
            <img src={photos.p2} alt="Conjunto de yoga marrón doblado sobre fondo blanco" />
            <span><b>Conjunto arcilla</b>Nuevo</span>
          </a>
        </div>
        <div className="as-hero__photo"><img src={photos.p1} alt="Mujer en una postura de yoga de espalda arqueada, fotografía en blanco y negro" /></div>
      </section>

      <section id="prendas" className="as-shop" aria-labelledby="as-shop-title">
        <Reveal className="as-head">
          <h2 id="as-shop-title" className="as-title">Prendas</h2>
          <p className="as-head__aside">Tela que se mueve contigo.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="as-card">
            <a className="as-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la prenda" /></a>
            <h3 className="as-card__name" data-product-field="name">Prenda</h3>
            <p className="as-card__price" data-product-field="price" />
            <button type="button" className="as-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="as-grid" data-pagosya-catalog />
      </section>

      <section id="practica" className="as-practice" aria-labelledby="as-practice-title">
        <Reveal className="as-head">
          <h2 id="as-practice-title" className="as-title">Tu práctica</h2>
        </Reveal>
        <div className="as-practice__grid">
          {practices.map((item, index) => <Reveal key={item.name} delay={index * 60}>
            <a className="as-practice__item" href="#prendas">
              <img src={photos[item.slot]} alt={item.alt} />
              <span className="as-practice__name">{item.name}</span>
              <span className="as-practice__note">{item.note}</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="tejido" className="as-fabric" aria-labelledby="as-fabric-title">
        <div className="as-fabric__photo">
          <Parallax strength={60} mobileStrength={22} className="as-drift"><img src={photos.detalle} alt="Primer plano de una tela elástica color verde salvia" /></Parallax>
        </div>
        <Reveal className="as-fabric__copy">
          <p className="as-kicker">La tela</p>
          <h2 id="as-fabric-title" className="as-title">Respira, se estira y vuelve</h2>
          <p>Un tejido de poliamida y elastano que sigue tu movimiento sin apretar. Seca rápido, no se pilla y mantiene su forma después de muchos lavados.</p>
        </Reveal>
      </section>

      <section id="clases" className="as-classes" aria-labelledby="as-classes-title">
        <Reveal className="as-head">
          <h2 id="as-classes-title" className="as-title">Clases de la semana</h2>
          <p className="as-head__aside">Cupos limitados. Escríbenos para reservar el tuyo.</p>
        </Reveal>
        <ul className="as-classes__list">
          {classes.map((item, index) => <li key={item.name}>
            <Reveal delay={index * 60}>
              <span className="as-classes__when">{item.day} · {item.time}</span>
              <span className="as-classes__name">{item.name}</span>
              <span className="as-classes__room">{item.room}</span>
              <a className="as-classes__link" href="#boletin">Reservar</a>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="resenas" className="as-reviews" aria-labelledby="as-reviews-title">
        <Reveal className="as-head">
          <h2 id="as-reviews-title" className="as-title">Lo que dicen</h2>
        </Reveal>
        <div className="as-quotes">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
            <figure className="as-quote">
              <blockquote>{review.quote}</blockquote>
              <figcaption><b>{review.name}</b> · {review.city}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="as-news" aria-labelledby="as-news-title" data-pagosya-subscribe-block>
        <Reveal className="as-news__inner">
          <h2 id="as-news-title" className="as-news__title">Un aviso, con calma</h2>
          <p className="as-news__text">Novedades y horarios de clases, una vez al mes.</p>
          <button type="button" className="as-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="as-news__field">Tu correo electrónico</span>
            <span className="as-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="as-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
