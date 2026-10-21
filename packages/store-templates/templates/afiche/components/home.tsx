import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const sizes = [
  { name: 'A3', dim: '29,7 × 42 cm', scale: 'af-size--s' },
  { name: 'A2', dim: '42 × 59,4 cm', scale: 'af-size--m' },
  { name: '50 × 70', dim: '50 × 70 cm', scale: 'af-size--l' },
];

const frames = [
  { name: copy.home_1, tone: 'oak' },
  { name: copy.home_2, tone: 'black' },
  { name: copy.home_3, tone: 'white' },
  { name: copy.home_4, tone: 'none' },
];

const artists = [
  { slot: 'p2', name: copy.home_5, style: 'Puntos y formas', alt: copy.home_6 },
  { slot: 'p3', name: copy.home_7, style: 'Línea botánica', alt: copy.home_8 },
  { slot: 'p4', name: copy.home_9, style: 'Geometría audaz', alt: copy.home_10 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="af-hero" aria-labelledby="af-hero-title">
        <div className="af-hero__copy">
          <h1 id="af-hero-title" className="af-hero__title">{copy.home_11}</h1>
          <p className="af-hero__lead">{copy.home_12}</p>
          <a className="af-link" href="#afiches">{copy.home_13}<span aria-hidden="true">↗</span></a>
        </div>
        <div className="af-hero__collage">
          <img className="af-hero__main" src={photos.p1} alt={copy.home_14} />
          <div className="af-hero__minis">
            <img src={photos.p2} alt={copy.home_15} />
            <img src={photos.p3} alt={copy.home_16} />
          </div>
        </div>
      </section>

      <section id="afiches" className="af-shop" aria-labelledby="af-shop-title">
        <Reveal className="af-head">
          <h2 id="af-shop-title" className="af-title">{copy.home_17}</h2>
          <p className="af-head__aside">{copy.home_18}</p>
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
          <h2 id="af-sizes-title" className="af-title">{copy.home_19}</h2>
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
          <Parallax strength={60} mobileStrength={22} className="af-drift"><img src={photos.taller} alt={copy.home_20} /></Parallax>
        </div>
        <Reveal className="af-frames__copy">
          <h2 id="af-frames-title" className="af-title">{copy.home_21}</h2>
          <p>{copy.home_22}</p>
          <ul className="af-frames__list">
            {frames.map(frame => <li key={frame.name}><span className={`af-swatch af-swatch--${frame.tone}`} aria-hidden="true" />{frame.name}</li>)}
          </ul>
        </Reveal>
      </section>

      <section id="artistas" className="af-artists" aria-labelledby="af-artists-title">
        <Reveal className="af-head">
          <h2 id="af-artists-title" className="af-title">{copy.home_23}</h2>
          <p className="af-head__aside">{copy.home_24}</p>
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
        <img className="af-wall__photo" src={photos.pared} alt={copy.home_25} />
        <Reveal className="af-wall__copy">
          <h2 id="af-wall-title" className="af-title">{copy.home_26}</h2>
          <p>{copy.home_27}{store.name}{copy.home_28}</p>
          <a className="af-link" href="#afiches">{copy.home_29}</a>
        </Reveal>
      </section>

      <section id="boletin" className="af-news" aria-labelledby="af-news-title" data-pagosya-subscribe-block>
        <Reveal className="af-news__inner">
          <h2 id="af-news-title" className="af-news__title">{copy.home_30}</h2>
          <p className="af-news__text">{copy.home_31}</p>
          <button type="button" className="af-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="af-news__field">{copy.home_32}</span>
            <span className="af-news__submit">{copy.home_33}</span>
          </button>
          <p role="status" className="af-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
