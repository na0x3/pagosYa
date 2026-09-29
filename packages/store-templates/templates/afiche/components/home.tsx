import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const sizes = [
  { name: 'A3', dim: '29,7 × 42 cm', scale: 'af-size--s' },
  { name: 'A2', dim: '42 × 59,4 cm', scale: 'af-size--m' },
  { name: '50 × 70', dim: '50 × 70 cm', scale: 'af-size--l' },
];

const frames = [
  { name: 'Roble', tone: 'oak' },
  { name: 'Negro', tone: 'black' },
  { name: 'Blanco', tone: 'white' },
  { name: 'Sin marco', tone: 'none' },
];

const artists = [
  { slot: 'p2', name: 'Lucía Fernández', style: 'Puntos y formas', alt: 'Afiche azul con puntos y formas abstractas' },
  { slot: 'p3', name: 'Marcos Villca', style: 'Línea botánica', alt: 'Afiche crema con flores dibujadas a línea' },
  { slot: 'p4', name: 'Ana Quispe', style: 'Geometría audaz', alt: 'Afiche verde amarillento con formas geométricas' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="af-hero" aria-labelledby="af-hero-title">
        <div className="af-hero__copy">
          <h1 id="af-hero-title" className="af-hero__title">Arte audaz que habla fuerte</h1>
          <p className="af-hero__lead">Afiches originales de artistas bolivianos, impresos en papel de museo y listos para colgar.</p>
          <a className="af-link" href="#afiches">Ver todos los afiches <span aria-hidden="true">↗</span></a>
        </div>
        <div className="af-hero__collage">
          <img className="af-hero__main" src={photos.p1} alt="Hombre colgando un afiche enmarcado de un caballo en píxeles sobre una pared clara" />
          <div className="af-hero__minis">
            <img src={photos.p2} alt="Afiche azul con puntos y formas" />
            <img src={photos.p3} alt="Afiche crema con flores dibujadas" />
          </div>
        </div>
      </section>

      <section id="afiches" className="af-shop" aria-labelledby="af-shop-title">
        <Reveal className="af-head">
          <h2 id="af-shop-title" className="af-title">Todos los afiches</h2>
          <p className="af-head__aside">Tirada limitada de cada diseño, firmada por su artista.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="af-card">
            <a className="af-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del afiche" /></a>
            <h3 className="af-card__name" data-product-field="name">Afiche</h3>
            <p className="af-card__price" data-product-field="price" />
            <button type="button" className="af-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="af-grid" data-pagosya-catalog />
      </section>

      <section id="tamanos" className="af-sizes" aria-labelledby="af-sizes-title">
        <Reveal className="af-head">
          <h2 id="af-sizes-title" className="af-title">Tres tamaños</h2>
        </Reveal>
        <ul className="af-sizes__list">
          {sizes.map((size, index) => <li key={size.name}>
            <Reveal delay={index * 60}>
              <span className={`af-size ${size.scale}`} aria-hidden="true" />
              <b className="af-sizes__name">{size.name}</b>
              <span className="af-sizes__dim">{size.dim}</span>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="marcos" className="af-frames" aria-labelledby="af-frames-title">
        <div className="af-frames__photo">
          <Parallax strength={60} mobileStrength={22} className="af-drift"><img src={photos.taller} alt="Manos levantando un afiche recién impreso de una prensa" /></Parallax>
        </div>
        <Reveal className="af-frames__copy">
          <h2 id="af-frames-title" className="af-title">Con marco o sin marco</h2>
          <p>Enmarcamos a mano con madera de la región. Si prefieres, te lo enviamos enrollado en tubo rígido y lo enmarcas donde quieras.</p>
          <ul className="af-frames__list">
            {frames.map(frame => <li key={frame.name}><span className={`af-swatch af-swatch--${frame.tone}`} aria-hidden="true" />{frame.name}</li>)}
          </ul>
        </Reveal>
      </section>

      <section id="artistas" className="af-artists" aria-labelledby="af-artists-title">
        <Reveal className="af-head">
          <h2 id="af-artists-title" className="af-title">Quién los dibuja</h2>
          <p className="af-head__aside">Ilustradoras e ilustradores de aquí, con su propia voz.</p>
        </Reveal>
        <div className="af-artists__grid">
          {artists.map((artist, index) => <Reveal key={artist.name} delay={index * 60}>
            <a className="af-artist" href="#afiches">
              <img src={photos[artist.slot]} alt={artist.alt} />
              <span className="af-artist__name">{artist.name}</span>
              <span className="af-artist__style">{artist.style}</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="pared" className="af-wall" aria-labelledby="af-wall-title">
        <img className="af-wall__photo" src={photos.pared} alt="Pared con cinco afiches enmarcados sobre un escritorio de madera" />
        <Reveal className="af-wall__copy">
          <h2 id="af-wall-title" className="af-title">Ideas para tu pared</h2>
          <p>Un solo afiche grande en la sala, tres pequeños en el pasillo o una galería completa sobre tu escritorio. Empieza por uno de {store.name} y sigue.</p>
          <a className="af-link" href="#afiches">Ver los afiches</a>
        </Reveal>
      </section>

      <section id="boletin" className="af-news" aria-labelledby="af-news-title" data-pagosya-subscribe-block>
        <Reveal className="af-news__inner">
          <h2 id="af-news-title" className="af-news__title">Nuevos afiches, primero para ti</h2>
          <p className="af-news__text">Un correo por lanzamiento, con el arte y su artista.</p>
          <button type="button" className="af-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="af-news__field">Tu correo electrónico</span>
            <span className="af-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="af-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
