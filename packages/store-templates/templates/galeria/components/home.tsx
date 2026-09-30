import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const steps = [
  { n: '1', title: 'Elige tu obra', text: 'Cada pieza es única: cuando se vende, no vuelve a estar disponible.' },
  { n: '2', title: 'Recibe el certificado', text: 'Firmado a mano, con número de registro y datos de la técnica.' },
  { n: '3', title: 'Envío enmarcado', text: 'Sale protegida y, si quieres, con marco de madera a medida.' },
];

const series = [
  { slot: 'p2', name: 'Campo abierto', note: 'Óleo sobre lienzo', alt: 'Paisaje abstracto en ocres y verde musgo' },
  { slot: 'p3', name: 'Limones', note: 'Óleo sobre lienzo', alt: 'Naturaleza muerta con limones en colores intensos' },
  { slot: 'p4', name: 'Estudio azul', note: 'Óleo sobre lienzo', alt: 'Estudio de retrato en tonos azules' },
  { slot: 'p1', name: 'Begonias', note: 'Óleo sobre lienzo', alt: 'Mujer dormida entre hojas de begonia moteadas' },
];

const shows = [
  { date: 'Marzo', place: 'Casa de la Cultura, La Paz', title: 'Hojas y sueños' },
  { date: 'Junio', place: 'Galería Espacio, Cochabamba', title: 'Colores del valle' },
  { date: 'Octubre', place: 'Centro Cultural, Santa Cruz', title: 'Retratos' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="ga-hero" aria-labelledby="ga-hero-title">
        <img className="ga-hero__art" src={photos.p1} alt="Pintura al óleo de una mujer dormida entre hojas de begonia rojas y verdes" />
        <div className="ga-hero__caption">
          <h1 id="ga-hero-title" className="ga-hero__title">Arte ahora</h1>
          <p className="ga-hero__sub">Obras contemporáneas de {store.name}</p>
          <a className="ga-link" href="#obras">Ver obras <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <section id="obras" className="ga-shop" aria-labelledby="ga-shop-title">
        <Reveal className="ga-head">
          <h2 id="ga-shop-title" className="ga-title">Obras disponibles</h2>
          <p className="ga-head__aside">Óleos originales, firmados y con certificado.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ga-card">
            <a className="ga-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la obra" /></a>
            <h3 className="ga-card__name" data-product-field="name">Obra</h3>
            <p className="ga-card__meta">Óleo sobre lienzo</p>
            <p className="ga-card__price" data-product-field="price" />
            <button type="button" className="ga-card__add" data-product-add>Agregar a mi selección</button>
          </article>
        </template>
        <div className="ga-grid" data-pagosya-catalog />
      </section>

      <section id="artista" className="ga-artist" aria-labelledby="ga-artist-title">
        <div className="ga-artist__photo">
          <Parallax strength={60} mobileStrength={22} className="ga-drift"><img src={photos.estudio} alt="La pintora frente a su caballete en un taller lleno de luz" /></Parallax>
        </div>
        <Reveal className="ga-artist__copy">
          <p className="ga-kicker">Sobre la artista</p>
          <h2 id="ga-artist-title" className="ga-title">Pinto lo que se queda en la memoria</h2>
          <p>Empecé pintando hojas de mi patio y terminé pintando a la gente que las mira. Trabajo al óleo, despacio, con capas finas y muchos colores que se contradicen.</p>
          <p>Cada obra que sale de mi taller lleva una historia. Espero que la tuya empiece cuando la cuelgues en tu pared.</p>
        </Reveal>
      </section>

      <section id="coleccionar" className="ga-collect" aria-labelledby="ga-collect-title">
        <Reveal className="ga-head">
          <h2 id="ga-collect-title" className="ga-title">Cómo coleccionar</h2>
        </Reveal>
        <ol className="ga-steps">
          {steps.map((step, index) => <li key={step.n}>
            <Reveal delay={index * 60}>
              <span className="ga-steps__n">{step.n}</span>
              <b className="ga-steps__title">{step.title}</b>
              <span className="ga-steps__text">{step.text}</span>
            </Reveal>
          </li>)}
        </ol>
      </section>

      <section id="serie" className="ga-series" aria-labelledby="ga-series-title">
        <Reveal className="ga-head">
          <h2 id="ga-series-title" className="ga-title">La serie más reciente</h2>
        </Reveal>
        <ul className="ga-rail">
          {series.map(item => <li key={item.slot}>
            <a href="#obras">
              <img src={photos[item.slot]} alt={item.alt} />
              <span className="ga-rail__name">{item.name}</span>
              <span className="ga-rail__note">{item.note}</span>
            </a>
          </li>)}
        </ul>
      </section>

      <section id="exposiciones" className="ga-shows" aria-labelledby="ga-shows-title">
        <Reveal className="ga-head">
          <h2 id="ga-shows-title" className="ga-title">Exposiciones</h2>
        </Reveal>
        <ul className="ga-shows__list">
          {shows.map((show, index) => <li key={show.title}>
            <Reveal delay={index * 60}>
              <span className="ga-shows__date">{show.date}</span>
              <span className="ga-shows__title">{show.title}</span>
              <span className="ga-shows__place">{show.place}</span>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="boletin" className="ga-news" aria-labelledby="ga-news-title" data-pagosya-subscribe-block>
        <Reveal className="ga-news__inner">
          <h2 id="ga-news-title" className="ga-news__title">Sé el primero en ver la próxima obra</h2>
          <p className="ga-news__text">Te invitamos a cada inauguración y te avisamos cuando sale una serie nueva.</p>
          <button type="button" className="ga-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="ga-news__field">Tu correo electrónico</span>
            <span className="ga-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="ga-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
