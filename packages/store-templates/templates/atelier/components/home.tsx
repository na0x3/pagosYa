import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const materials = [
  { name: copy.home_1, note: copy.home_2, tone: 'tan' },
  { name: copy.home_3, note: copy.home_4, tone: 'brass' },
  { name: copy.home_5, note: copy.home_6, tone: 'wine' },
];

const notes = [
  { n: '01', title: copy.home_7, text: copy.home_8 },
  { n: '02', title: copy.home_9, text: copy.home_10 },
  { n: '03', title: copy.home_11, text: copy.home_12 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="at-hero" aria-labelledby="at-hero-title">
        <img className="at-hero__photo" src={photos.p1} alt={copy.home_13} />
        <div className="at-hero__copy">
          <h1 id="at-hero-title" className="at-hero__title">{copy.home_14}</h1>
          <p className="at-hero__lead">{copy.home_15}{store.name}{copy.home_16}</p>
          <a className="at-link at-link--light" href="#piezas">{copy.home_17}</a>
        </div>
      </section>

      <section id="piezas" className="at-shop" aria-labelledby="at-shop-title">
        <Reveal className="at-head">
          <h2 id="at-shop-title" className="at-title">{copy.home_18}</h2>
          <p className="at-head__aside">{copy.home_19}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="at-card">
            <a className="at-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la pieza" /></a>
            <h3 className="at-card__name" data-product-field="name">Pieza</h3>
            <p className="at-card__price" data-product-field="price" />
            <button type="button" className="at-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="at-grid" data-pagosya-catalog />
      </section>

      <section id="oficio" className="at-craft" aria-labelledby="at-craft-title">
        <div className="at-craft__photo">
          <Parallax strength={60} mobileStrength={22} className="at-drift"><img src={photos.taller} alt={copy.home_20} /></Parallax>
        </div>
        <Reveal className="at-craft__copy">
          <p className="at-kicker">{copy.home_21}</p>
          <h2 id="at-craft-title" className="at-title">{copy.home_22}</h2>
          <p>{copy.home_23}</p>
        </Reveal>
      </section>

      <section id="materiales" className="at-materials" aria-labelledby="at-materials-title">
        <Reveal className="at-head at-head--light">
          <h2 id="at-materials-title" className="at-title at-title--light">{copy.home_24}</h2>
        </Reveal>
        <div className="at-materials__grid">
          {materials.map((item, index) => <Reveal key={item.name} delay={index * 60}>
            <div className="at-material">
              <span className={`at-material__swatch at-material__swatch--${item.tone}`} aria-hidden="true" />
              <b className="at-material__name">{item.name}</b>
              <span className="at-material__note">{item.note}</span>
            </div>
          </Reveal>)}
        </div>
      </section>

      <section id="regalos" className="at-gifts" aria-labelledby="at-gifts-title">
        <Reveal className="at-gifts__inner">
          <img className="at-gifts__photo" src={photos.detalle} alt={copy.home_25} />
          <div className="at-gifts__copy">
            <p className="at-kicker">{copy.home_26}</p>
            <h2 id="at-gifts-title" className="at-title">{copy.home_27}</h2>
            <p>{copy.home_28}</p>
            <a className="at-link" href="#piezas">{copy.home_29}</a>
          </div>
        </Reveal>
      </section>

      <section id="atelier" className="at-feature" aria-labelledby="at-feature-title">
        <Reveal className="at-feature__photo"><img src={photos.p2} alt={copy.home_30} /></Reveal>
        <Reveal className="at-feature__copy" delay={80}>
          <p className="at-kicker">{copy.home_31}</p>
          <h2 id="at-feature-title" className="at-title">{copy.home_32}</h2>
          <ul className="at-notes">
            {notes.map(note => <li key={note.n}><span className="at-notes__n">{note.n}</span><span><b>{note.title}</b>{note.text}</span></li>)}
          </ul>
          <a className="at-btn" href="#piezas">{copy.home_33}</a>
        </Reveal>
      </section>

      <section id="boletin" className="at-news" aria-labelledby="at-news-title" data-pagosya-subscribe-block>
        <Reveal className="at-news__inner">
          <h2 id="at-news-title" className="at-news__title">{copy.home_34}</h2>
          <p className="at-news__text">{copy.home_35}</p>
          <button type="button" className="at-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="at-news__field">{copy.home_36}</span>
            <span className="at-news__submit">{copy.home_37}</span>
          </button>
          <p role="status" className="at-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
