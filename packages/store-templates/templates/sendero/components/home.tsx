import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const features = [
  { title: 'Impermeable', text: 'Tela con recubrimiento y cierre enrollable: la lluvia se queda afuera.' },
  { title: 'Costuras selladas', text: 'Cada costura lleva cinta térmica. Aguanta cargas duras y días enteros de camino.' },
  { title: 'Garantía de por vida', text: 'Si una costura o un cierre falla, lo reparamos o lo cambiamos sin discutir.' },
];

const categories = [
  { name: 'Mochilas', note: 'De 20 a 65 litros', slot: 'p2' },
  { name: 'Bolsos', note: 'Riñoneras y bolsos de mano', slot: 'p4' },
  { name: 'Accesorios', note: 'Hebillas, cintas y fundas', slot: 'detalle' },
];

const specs = [
  ['Capacidad', '28 litros'],
  ['Peso', '1,1 kg'],
  ['Tela', 'Nylon 500D con recubrimiento'],
  ['Cierre', 'Enrollable y hermético'],
  ['Espalda', 'Malla ventilada acolchada'],
  ['Garantía', 'De por vida en costuras'],
];

const reviews = [
  { quote: 'La llevé al Huayna Potosí bajo nieve y lluvia. Adentro todo llegó seco. No la cambio por nada.', name: 'Rodrigo', route: 'Ruta Huayna Potosí' },
  { quote: 'Cómoda con 12 kilos durante cuatro días de trekking. Las correas no me lastimaron nada.', name: 'Ximena', route: 'Camino del Choro' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="se-hero" aria-labelledby="se-hero-title">
        <div className="se-hero__photo">
          <img src={photos.p1} alt={`Persona con una mochila verde en un bosque de pinos con niebla, equipo de ${store.name}`} />
          <div className="se-hero__copy">
            <p className="se-kicker">Equipo de montaña</p>
            <h1 id="se-hero-title" className="se-hero__title">Hecha para lo salvaje</h1>
            <a className="se-btn" href="#equipo">Ver mochilas</a>
          </div>
        </div>
        <aside className="se-hero__panel" aria-label="Producto destacado">
          <span className="se-tag">Nuevo</span>
          <img src={photos.p2} alt="Mochila enrollable verde oliva sobre fondo gris" />
          <p className="se-hero__name">Mochila Ruta 28 L</p>
          <a className="se-hero__price" href="#equipo">Ver precio y colores →</a>
          <div className="se-swatches" aria-hidden="true"><i style={{ background: '#55603f' }} /><i style={{ background: '#141513' }} /><i style={{ background: '#c7642b' }} /></div>
        </aside>
      </section>

      <section id="equipo" className="se-shop" aria-labelledby="se-shop-title">
        <Reveal className="se-head">
          <h2 id="se-shop-title" className="se-title">Equipo para el camino</h2>
          <p className="se-head__aside">Cada pieza se prueba en ruta antes de llegar a la tienda.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="se-card">
            <a className="se-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="se-card__name" data-product-field="name">Producto</h3>
            <p className="se-card__price" data-product-field="price" />
            <button type="button" className="se-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="se-grid" data-pagosya-catalog />
      </section>

      <section id="expedicion" className="se-expedition" aria-labelledby="se-exp-title">
        <Parallax strength={80} mobileStrength={26} className="se-drift"><img src={photos.p3} alt="Excursionista descansando en una cresta sobre las nubes al amanecer" /></Parallax>
        <div className="se-expedition__inner">
          <Reveal>
            <h2 id="se-exp-title" className="se-title se-title--light">Probada donde importa</h2>
          </Reveal>
          <ul className="se-features">
            {features.map((item, index) => <li key={item.title}>
              <Reveal delay={index * 60}>
                <b className="se-features__title">{item.title}</b>
                <span className="se-features__text">{item.text}</span>
              </Reveal>
            </li>)}
          </ul>
        </div>
      </section>

      <section id="categorias" className="se-cats" aria-labelledby="se-cats-title">
        <Reveal className="se-head">
          <h2 id="se-cats-title" className="se-title">Elige por categoría</h2>
        </Reveal>
        <div className="se-cats__grid">
          {categories.map((cat, index) => <Reveal key={cat.name} delay={index * 60}>
            <a className="se-cat" href="#equipo">
              <img src={photos[cat.slot]} alt="" aria-hidden="true" />
              <span className="se-cat__name">{cat.name}</span>
              <span className="se-cat__note">{cat.note}</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="especificaciones" className="se-specs" aria-labelledby="se-specs-title">
        <div className="se-specs__photo"><img src={photos.ruta} alt="Dos excursionistas caminando por un sendero de los Andes" /></div>
        <Reveal className="se-specs__copy">
          <p className="se-kicker se-kicker--dark">Mochila Ruta 28 L</p>
          <h2 id="se-specs-title" className="se-title">Lo que lleva por dentro</h2>
          <dl className="se-specs__table">
            {specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          <a className="se-btn se-btn--dark" href="#equipo">Ver el equipo</a>
        </Reveal>
      </section>

      <section id="resenas" className="se-reviews" aria-labelledby="se-reviews-title">
        <Reveal className="se-head">
          <h2 id="se-reviews-title" className="se-title">Desde el sendero</h2>
        </Reveal>
        <div className="se-quotes">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
            <figure className="se-quote">
              <blockquote className="se-quote__text">{review.quote}</blockquote>
              <figcaption className="se-quote__who"><b>{review.name}</b> · {review.route}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="se-news" aria-labelledby="se-news-title" data-pagosya-subscribe-block>
        <Reveal className="se-news__inner">
          <h2 id="se-news-title" className="se-news__title">Rutas y novedades, sin ruido</h2>
          <p className="se-news__text">Una carta al mes con una ruta, una guía de equipo y las llegadas nuevas.</p>
          <button type="button" className="se-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="se-news__field">Tu correo electrónico</span>
            <span className="se-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="se-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
