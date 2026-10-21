import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const features = [
  { title: copy.home_1, text: copy.home_2 },
  { title: copy.home_3, text: copy.home_4 },
  { title: copy.home_5, text: copy.home_6 },
];

const categories = [
  { name: copy.home_7, note: copy.home_8, slot: 'p2' },
  { name: copy.home_9, note: copy.home_10, slot: 'p4' },
  { name: copy.home_11, note: copy.home_12, slot: 'detalle' },
];

const specs = [
  [copy.home_13, '28 litros'],
  [copy.home_14, '1,1 kg'],
  [copy.home_15, copy.home_16],
  [copy.home_17, copy.home_18],
  [copy.home_19, copy.home_20],
  [copy.home_21, copy.home_22],
];

const reviews = [
  { quote: copy.home_23, name: copy.home_24, route: copy.home_25 },
  { quote: copy.home_26, name: copy.home_27, route: copy.home_28 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="se-hero" aria-labelledby="se-hero-title">
        <div className="se-hero__photo">
          <img src={photos.p1} alt={`Persona con una mochila verde en un bosque de pinos con niebla, equipo de ${store.name}`} />
          <div className="se-hero__copy">
            <p className="se-kicker">{copy.home_29}</p>
            <h1 id="se-hero-title" className="se-hero__title">{copy.home_30}</h1>
            <a className="se-btn" href="#equipo">{copy.home_31}</a>
          </div>
        </div>
        <aside className="se-hero__panel" aria-label="Producto destacado">
          <span className="se-tag">{copy.home_32}</span>
          <img src={photos.p2} alt={copy.home_33} />
          <p className="se-hero__name">{copy.home_34}</p>
          <a className="se-hero__price" href="#equipo">{copy.home_35}</a>
          <div className="se-swatches" aria-hidden="true"><i style={{ background: '#55603f' }} /><i style={{ background: '#141513' }} /><i style={{ background: '#c7642b' }} /></div>
        </aside>
      </section>

      <section id="equipo" className="se-shop" aria-labelledby="se-shop-title">
        <Reveal className="se-head">
          <h2 id="se-shop-title" className="se-title">{copy.home_36}</h2>
          <p className="se-head__aside">{copy.home_37}</p>
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
        <Parallax strength={80} mobileStrength={26} className="se-drift"><img src={photos.p3} alt={copy.home_38} /></Parallax>
        <div className="se-expedition__inner">
          <Reveal>
            <h2 id="se-exp-title" className="se-title se-title--light">{copy.home_39}</h2>
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
          <h2 id="se-cats-title" className="se-title">{copy.home_40}</h2>
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
        <div className="se-specs__photo"><img src={photos.ruta} alt={copy.home_41} /></div>
        <Reveal className="se-specs__copy">
          <p className="se-kicker se-kicker--dark">{copy.home_42}</p>
          <h2 id="se-specs-title" className="se-title">{copy.home_43}</h2>
          <dl className="se-specs__table">
            {specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          <a className="se-btn se-btn--dark" href="#equipo">{copy.home_44}</a>
        </Reveal>
      </section>

      <section id="resenas" className="se-reviews" aria-labelledby="se-reviews-title">
        <Reveal className="se-head">
          <h2 id="se-reviews-title" className="se-title">{copy.home_45}</h2>
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
          <h2 id="se-news-title" className="se-news__title">{copy.home_46}</h2>
          <p className="se-news__text">{copy.home_47}</p>
          <button type="button" className="se-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="se-news__field">{copy.home_48}</span>
            <span className="se-news__submit">{copy.home_49}</span>
          </button>
          <p role="status" className="se-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
