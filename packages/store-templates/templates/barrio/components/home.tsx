import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const looks = [
  { slot: 'p2', tag: '01', name: 'Hoodie oversize', note: 'Algodón pesado, corte ancho', alt: 'Modelo con un hoodie negro oversize sobre un muro verde salvia' },
  { slot: 'p3', tag: '02', name: 'Pantalón cargo', note: 'Bolsillos grandes, tiro alto', alt: 'Modelo caminando con pantalón cargo ancho y zapatillas' },
  { slot: 'p4', tag: '03', name: 'Gorra y tote', note: 'Para completar el look', alt: 'Gorra negra y bolso de lona sobre concreto' },
];

const code = [
  { n: '01', title: 'Tiradas cortas', text: 'Cada prenda se hace en una serie pequeña. Cuando se acaba, no vuelve.' },
  { n: '02', title: 'Corte propio', text: 'Patrones anchos y largos que dibujamos con gente del barrio.' },
  { n: '03', title: 'Hecho aquí', text: 'Cosido y estampado en talleres de la ciudad, con nombre y apellido.' },
  { n: '04', title: 'Sin vueltas', text: 'Cambios en 7 días y envío a todo el país.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="ba-hero" aria-labelledby="ba-hero-title">
        <h1 id="ba-hero-title" className="ba-hero__name">[{store.name}]</h1>
        <div className="ba-hero__grid">
          <div className="ba-hero__boxes">
            <p><span>Cortes frescos</span></p>
            <p><span>y declaraciones</span></p>
            <p><span>de calle</span></p>
          </div>
          <div className="ba-hero__model">
            <img src={photos.p1} alt="Modelo con camiseta a rayas y pantalón ancho frente a una pared gris" />
          </div>
          <div className="ba-hero__side">
            <p className="ba-hero__drop">Drop 03 // Edición limitada</p>
            <p className="ba-hero__lead">Ropa por lanzamientos, hecha en talleres de la ciudad. Cuando se acaba, se acaba.</p>
            <span className="ba-barcode" aria-hidden="true" />
            <a className="ba-btn" href="#drop">Ver el drop</a>
          </div>
        </div>
      </section>

      <section id="drop" className="ba-shop" aria-labelledby="ba-shop-title">
        <Reveal className="ba-head">
          <h2 id="ba-shop-title" className="ba-title">El drop</h2>
          <p className="ba-head__aside">Disponible mientras dure. Elige tu talla y no lo pienses tanto.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ba-card">
            <a className="ba-card__media" data-product-link href="product.html"><span className="ba-card__tag">Nuevo</span><img data-product-field="image" alt="Foto de la prenda" /></a>
            <h3 className="ba-card__name" data-product-field="name">Prenda</h3>
            <p className="ba-card__price" data-product-field="price" />
            <button type="button" className="ba-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ba-grid" data-pagosya-catalog />
      </section>

      <section id="looks" className="ba-looks" aria-labelledby="ba-looks-title">
        <Reveal className="ba-head">
          <h2 id="ba-looks-title" className="ba-title">Looks</h2>
          <p className="ba-head__aside">Tres formas de llevar el drop.</p>
        </Reveal>
        <div className="ba-looks__grid">
          {looks.map((look, index) => <Reveal key={look.slot} delay={index * 70}>
            <a className="ba-look" href="#drop">
              <img src={photos[look.slot]} alt={look.alt} />
              <span className="ba-look__tag">{look.tag}</span>
              <span className="ba-look__label"><b>{look.name}</b>{look.note}</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="codigo" className="ba-code" aria-labelledby="ba-code-title">
        <Reveal className="ba-head ba-head--light">
          <h2 id="ba-code-title" className="ba-title">El código</h2>
        </Reveal>
        <ul className="ba-code__list">
          {code.map((item, index) => <li key={item.n}>
            <Reveal delay={index * 60}>
              <span className="ba-code__n">{item.n}</span>
              <b className="ba-code__title">{item.title}</b>
              <span className="ba-code__text">{item.text}</span>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="cuenta-atras" className="ba-next" aria-labelledby="ba-next-title">
        <Reveal className="ba-next__inner">
          <p className="ba-next__label">Próximo lanzamiento</p>
          <h2 id="ba-next-title" className="ba-next__title">Drop 04</h2>
          <p className="ba-next__date">Sábado · 12:00 · Solo en línea</p>
          <a className="ba-btn ba-btn--light" href="#boletin">Avísame primero</a>
        </Reveal>
      </section>

      <section id="comunidad" className="ba-crew" aria-labelledby="ba-crew-title">
        <Reveal className="ba-head">
          <h2 id="ba-crew-title" className="ba-title">Comunidad</h2>
          <p className="ba-head__aside">Gente real usando ropa real. Etiquétanos y sales aquí.</p>
        </Reveal>
        <div className="ba-crew__grid">
          <Parallax strength={60} mobileStrength={22} className="ba-drift"><img src={photos.calle} alt="Un grupo de amigos en una plaza de skate al atardecer" /></Parallax>
          <Reveal className="ba-crew__detail"><img src={photos.detalle} alt="Etiqueta tejida y costuras de una prenda" /></Reveal>
        </div>
      </section>

      <section id="boletin" className="ba-news" aria-labelledby="ba-news-title" data-pagosya-subscribe-block>
        <Reveal className="ba-news__inner">
          <h2 id="ba-news-title" className="ba-news__title">No te pierdas el próximo drop</h2>
          <p className="ba-news__text">Te escribimos una hora antes de que salga. Solo eso.</p>
          <button type="button" className="ba-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="ba-news__field">Tu correo electrónico</span>
            <span className="ba-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="ba-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
