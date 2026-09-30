import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const eras = [
  { years: 'Años 40', text: 'Héroes de guerra, portadas pintadas a mano y papel que huele a historia.' },
  { years: 'Años 70', text: 'Cómics de terror, ciencia ficción y aventuras con líneas gruesas y color plano.' },
  { years: 'Años 90', text: 'Series de culto, ediciones variantes y portadas que hoy se buscan en todo el mundo.' },
];

const grades = [
  { label: 'Mint', text: 'Como salió de imprenta. Sin dobleces, sin marcas.' },
  { label: 'Fine', text: 'Muy buen estado. Uso mínimo y colores vivos.' },
  { label: 'Good', text: 'Se nota el paso del tiempo, pero se lee completo y sin roturas.' },
];

const care = [
  { title: 'Funda y cartón', text: 'Cada número viaja en funda de mylar y con tapa de cartón rígido.' },
  { title: 'Estado a la vista', text: 'Cada ficha dice el estado exacto y muestra fotos reales del ejemplar.' },
  { title: 'Envío asegurado', text: 'Sale con seguimiento y con el valor de la pieza declarado.' },
];

const voices = [
  { quote: 'Encontré el número que me faltaba hace veinte años. Llegó igual que en la foto, protegido como una joya.', name: 'Gustavo', city: 'La Paz' },
  { quote: 'Me explicaron cada estado con calma. Compré mi primera edición de colección sin miedo.', name: 'Natalia', city: 'Sucre' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="pu-hero" aria-labelledby="pu-hero-title">
        <div className="pu-hero__burst" aria-hidden="true" />
        <div className="pu-hero__copy">
          <p className="pu-kicker">Colección exclusiva</p>
          <h1 id="pu-hero-title" className="pu-hero__title">Las leyendas nunca mueren</h1>
          <p className="pu-hero__lead">Redescubre las portadas pintadas a mano y las historias que definieron una época. En {store.name} cada número se guarda con cariño.</p>
          <a className="pu-btn" href="#boveda">Entrar a la bóveda</a>
        </div>
        <div className="pu-hero__cover">
          <span className="pu-ribbon">Exclusivo</span>
          <img src={photos.p1} alt="Portada ilustrada estilo pulp de un robot con una mano enorme" />
        </div>
      </section>

      <section id="boveda" className="pu-shop" aria-labelledby="pu-shop-title">
        <Reveal className="pu-head">
          <h2 id="pu-shop-title" className="pu-title">La bóveda</h2>
          <p className="pu-head__aside">Números sueltos, series completas y rarezas. Cada uno con su ficha.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="pu-card">
            <a className="pu-card__media" data-product-link href="product.html">
              <img data-product-field="image" alt="Portada del cómic" />
              <span className="pu-card__price" data-product-field="price" />
            </a>
            <h3 className="pu-card__name" data-product-field="name">Cómic</h3>
            <button type="button" className="pu-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="pu-grid" data-pagosya-catalog />
      </section>

      <section id="epocas" className="pu-eras" aria-labelledby="pu-eras-title">
        <Reveal className="pu-head">
          <h2 id="pu-eras-title" className="pu-title">Elige tu época</h2>
        </Reveal>
        <div className="pu-eras__grid">
          {eras.map((era, index) => <Reveal key={era.years} delay={index * 60}>
            <a className="pu-era" href="#boveda">
              <span className="pu-era__years">{era.years}</span>
              <span className="pu-era__text">{era.text}</span>
              <span className="pu-era__go" aria-hidden="true">Ver números →</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="raros" className="pu-rare" aria-labelledby="pu-rare-title">
        <Parallax strength={60} mobileStrength={22} className="pu-drift"><img src={photos.estante} alt="Cajas largas llenas de cómics antiguos en estantes de una tienda cálida" /></Parallax>
        <Reveal className="pu-rare__card">
          <img className="pu-rare__cover" src={photos.p2} alt="Portada pulp de un cohete sobre un desierto a la luz de la luna" />
          <div className="pu-rare__copy">
            <p className="pu-kicker pu-kicker--dark">Pieza destacada</p>
            <h2 id="pu-rare-title" className="pu-title">Un número que casi nadie tiene</h2>
            <p>Cada mes separamos una edición rara con certificado y funda de archivo. Así clasificamos su estado:</p>
            <dl className="pu-grades">
              {grades.map(grade => <div key={grade.label}><dt>{grade.label}</dt><dd>{grade.text}</dd></div>)}
            </dl>
          </div>
        </Reveal>
      </section>

      <section id="cuidado" className="pu-care" aria-labelledby="pu-care-title">
        <Reveal className="pu-head">
          <h2 id="pu-care-title" className="pu-title">Así los cuidamos</h2>
        </Reveal>
        <div className="pu-care__grid">
          <Reveal className="pu-care__photo"><img src={photos.lupa} alt="Lupa de latón sobre un escritorio de madera junto a una pila de libros antiguos" /></Reveal>
          <ul className="pu-care__list">
            {care.map((item, index) => <li key={item.title}>
              <Reveal delay={index * 60}>
                <b className="pu-care__title">{item.title}</b>
                <span className="pu-care__text">{item.text}</span>
              </Reveal>
            </li>)}
          </ul>
        </div>
      </section>

      <section id="voces" className="pu-voices" aria-labelledby="pu-voices-title">
        <Reveal className="pu-head">
          <h2 id="pu-voices-title" className="pu-title">Cartas de lectores</h2>
        </Reveal>
        <div className="pu-voices__grid">
          {voices.map((voice, index) => <Reveal key={voice.name} delay={index * 60}>
            <figure className="pu-letter">
              <blockquote>{voice.quote}</blockquote>
              <figcaption>— {voice.name}, {voice.city}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="pu-news" aria-labelledby="pu-news-title" data-pagosya-subscribe-block>
        <Reveal className="pu-news__inner">
          <h2 id="pu-news-title" className="pu-news__title">Avisos de la bóveda</h2>
          <p className="pu-news__text">Te escribimos cuando llega una pieza rara o un número que buscabas. Nada más.</p>
          <button type="button" className="pu-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="pu-news__field">Tu correo electrónico</span>
            <span className="pu-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="pu-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
