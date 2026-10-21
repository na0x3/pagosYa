import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const looks = [
  { slot: 'p2', tag: '01', name: copy.home_1, note: copy.home_2, alt: copy.home_3 },
  { slot: 'p3', tag: '02', name: copy.home_4, note: copy.home_5, alt: copy.home_6 },
  { slot: 'p4', tag: '03', name: copy.home_7, note: copy.home_8, alt: copy.home_9 },
];

const code = [
  { n: '01', title: copy.home_10, text: copy.home_11 },
  { n: '02', title: copy.home_12, text: copy.home_13 },
  { n: '03', title: copy.home_14, text: copy.home_15 },
  { n: '04', title: copy.home_16, text: copy.home_17 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="ba-hero" aria-labelledby="ba-hero-title">
        <h1 id="ba-hero-title" className="ba-hero__name">[{store.name}]</h1>
        <div className="ba-hero__grid">
          <div className="ba-hero__boxes">
            <p><span>{copy.home_18}</span></p>
            <p><span>{copy.home_19}</span></p>
            <p><span>{copy.home_20}</span></p>
          </div>
          <div className="ba-hero__model">
            <img src={photos.p1} alt={copy.home_21} />
          </div>
          <div className="ba-hero__side">
            <p className="ba-hero__drop">{copy.home_22}</p>
            <p className="ba-hero__lead">{copy.home_23}</p>
            <span className="ba-barcode" aria-hidden="true" />
            <a className="ba-btn" href="#drop">{copy.home_24}</a>
          </div>
        </div>
      </section>

      <section id="drop" className="ba-shop" aria-labelledby="ba-shop-title">
        <Reveal className="ba-head">
          <h2 id="ba-shop-title" className="ba-title">{copy.home_25}</h2>
          <p className="ba-head__aside">{copy.home_26}</p>
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
          <h2 id="ba-looks-title" className="ba-title">{copy.home_27}</h2>
          <p className="ba-head__aside">{copy.home_28}</p>
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
          <h2 id="ba-code-title" className="ba-title">{copy.home_29}</h2>
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
          <p className="ba-next__label">{copy.home_30}</p>
          <h2 id="ba-next-title" className="ba-next__title">{copy.home_31}</h2>
          <p className="ba-next__date">{copy.home_32}</p>
          <a className="ba-btn ba-btn--light" href="#boletin">{copy.home_33}</a>
        </Reveal>
      </section>

      <section id="comunidad" className="ba-crew" aria-labelledby="ba-crew-title">
        <Reveal className="ba-head">
          <h2 id="ba-crew-title" className="ba-title">{copy.home_34}</h2>
          <p className="ba-head__aside">{copy.home_35}</p>
        </Reveal>
        <div className="ba-crew__grid">
          <Parallax strength={60} mobileStrength={22} className="ba-drift"><img src={photos.calle} alt={copy.home_36} /></Parallax>
          <Reveal className="ba-crew__detail"><img src={photos.detalle} alt={copy.home_37} /></Reveal>
        </div>
      </section>

      <section id="boletin" className="ba-news" aria-labelledby="ba-news-title" data-pagosya-subscribe-block>
        <Reveal className="ba-news__inner">
          <h2 id="ba-news-title" className="ba-news__title">{copy.home_38}</h2>
          <p className="ba-news__text">{copy.home_39}</p>
          <button type="button" className="ba-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="ba-news__field">{copy.home_40}</span>
            <span className="ba-news__submit">{copy.home_41}</span>
          </button>
          <p role="status" className="ba-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
