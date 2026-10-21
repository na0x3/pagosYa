import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const materials = [
  { title: copy.home_1, text: copy.home_2 },
  { title: copy.home_3, text: copy.home_4 },
  { title: copy.home_5, text: copy.home_6 },
];

const care = [
  { q: copy.home_7, a: copy.home_8 },
  { q: copy.home_9, a: copy.home_10 },
  { q: copy.home_11, a: copy.home_12 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="pl-hero" aria-labelledby="pl-hero-title">
        <div className="pl-hero__left">
          <img src={photos.p1} alt={copy.home_13} />
          <h1 id="pl-hero-title" className="pl-hero__title">{copy.home_14}</h1>
        </div>
        <div className="pl-hero__right">
          <img src={photos.p2} alt={copy.home_15} />
          <Reveal className="pl-sale">
            <p className="pl-sale__title">{copy.home_16}</p>
            <p className="pl-sale__text">15 % en toda la plata. Solo esta semana.</p>
            <a className="pl-link" href="#piezas">{copy.home_17}</a>
          </Reveal>
        </div>
      </section>

      <section id="piezas" className="pl-shop" aria-labelledby="pl-shop-title">
        <Reveal className="pl-head">
          <h2 id="pl-shop-title" className="pl-title">{copy.home_18}</h2>
          <p className="pl-head__aside">{copy.home_19}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="pl-card">
            <a className="pl-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la joya" /></a>
            <h3 className="pl-card__name" data-product-field="name">Joya</h3>
            <p className="pl-card__price" data-product-field="price" />
            <button type="button" className="pl-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="pl-grid" data-pagosya-catalog />
      </section>

      <section id="coleccion" className="pl-collection" aria-labelledby="pl-collection-title">
        <Parallax strength={70} mobileStrength={24} className="pl-drift"><img src={photos.p3} alt={copy.home_20} /></Parallax>
        <Reveal className="pl-collection__copy">
          <p className="pl-kicker">{copy.home_21}</p>
          <h2 id="pl-collection-title" className="pl-title pl-title--light">{copy.home_22}</h2>
          <a className="pl-link pl-link--light" href="#piezas">{copy.home_23}</a>
        </Reveal>
      </section>

      <section id="materiales" className="pl-materials" aria-labelledby="pl-materials-title">
        <Reveal className="pl-head">
          <h2 id="pl-materials-title" className="pl-title">{copy.home_24}</h2>
        </Reveal>
        <div className="pl-materials__grid">
          {materials.map((item, index) => <Reveal key={item.title} delay={index * 60}>
            <div className="pl-material">
              <p className="pl-material__title">{item.title}</p>
              <p className="pl-material__text">{item.text}</p>
            </div>
          </Reveal>)}
        </div>
      </section>

      <section id="lookbook" className="pl-look" aria-label="Lookbook">
        <Reveal className="pl-look__tall"><img src={photos.p4} alt={copy.home_25} /></Reveal>
        <Reveal className="pl-look__wide" delay={60}><img src={photos.estudio} alt={copy.home_26} /></Reveal>
        <Reveal className="pl-look__square" delay={120}><img src={photos.detalle} alt={copy.home_27} /></Reveal>
      </section>

      <section id="cuidado" className="pl-care" aria-labelledby="pl-care-title">
        <Reveal className="pl-head">
          <h2 id="pl-care-title" className="pl-title">{copy.home_28}</h2>
        </Reveal>
        <div className="pl-care__list">
          {care.map(item => <details key={item.q} className="pl-care__item">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>)}
        </div>
      </section>

      <section id="boletin" className="pl-news" aria-labelledby="pl-news-title" data-pagosya-subscribe-block>
        <Reveal className="pl-news__inner">
          <h2 id="pl-news-title" className="pl-news__title">{copy.home_29}</h2>
          <p className="pl-news__text">{copy.home_30}{store.name}. Sin llenar tu bandeja.</p>
          <button type="button" className="pl-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="pl-news__field">{copy.home_31}</span>
            <span className="pl-news__submit">{copy.home_32}</span>
          </button>
          <p role="status" className="pl-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
