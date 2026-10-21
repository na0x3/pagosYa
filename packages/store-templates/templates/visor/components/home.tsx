import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const bodies = [
  { name: copy.home_1, sensor: '1 pulgada', video: '4K a 30 fps', weight: '300 g', fit: copy.home_2 },
  { name: copy.home_3, sensor: copy.home_4, video: '4K a 60 fps', weight: '520 g', fit: copy.home_5 },
  { name: copy.home_6, sensor: copy.home_7, video: '6K a 30 fps', weight: '740 g', fit: copy.home_8 },
];

const lenses = [
  { mm: '24 mm', name: copy.home_9, note: copy.home_10 },
  { mm: '35 mm', name: copy.home_11, note: copy.home_12 },
  { mm: '50 mm', name: copy.home_13, note: copy.home_14 },
  { mm: '85 mm', name: copy.home_15, note: copy.home_16 },
];

const guides = [
  { title: copy.home_17, text: copy.home_18 },
  { title: copy.home_19, text: copy.home_20 },
  { title: copy.home_21, text: copy.home_22 },
];

const reviews = [
  { quote: copy.home_23, name: copy.home_24, city: copy.home_25 },
  { quote: copy.home_26, name: copy.home_27, city: copy.home_28 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="vi-hero" aria-labelledby="vi-hero-title">
        <div className="vi-hero__copy">
          <p className="vi-kicker">{copy.home_29}</p>
          <h1 id="vi-hero-title" className="vi-hero__title">{copy.home_30}</h1>
          <p className="vi-hero__lead">{copy.home_31}{store.name}.</p>
          <div className="vi-hero__actions">
            <a className="vi-btn" href="#equipo">{copy.home_32}</a>
            <a className="vi-btn vi-btn--ghost" href="#comparar">{copy.home_33}</a>
          </div>
        </div>
        <div className="vi-hero__stage">
          <img className="vi-hero__camera" src={photos.p1} alt={copy.home_34} />
          <aside className="vi-inset" aria-label="Modelo destacado">
            <img src={photos.p2} alt={copy.home_35} />
            <div>
              <p className="vi-inset__name">{copy.home_36}</p>
              <p className="vi-inset__note">{copy.home_37}</p>
              <a className="vi-inset__link" href="#equipo">{copy.home_38}</a>
            </div>
          </aside>
        </div>
      </section>

      <section id="equipo" className="vi-shop" aria-labelledby="vi-shop-title">
        <Reveal className="vi-head">
          <h2 id="vi-shop-title" className="vi-title">{copy.home_39}</h2>
          <p className="vi-head__aside">{copy.home_40}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="vi-card">
            <a className="vi-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="vi-card__name" data-product-field="name">Producto</h3>
            <p className="vi-card__price" data-product-field="price" />
            <button type="button" className="vi-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="vi-grid" data-pagosya-catalog />
      </section>

      <section id="comparar" className="vi-compare" aria-labelledby="vi-compare-title">
        <Reveal className="vi-head">
          <h2 id="vi-compare-title" className="vi-title">{copy.home_41}</h2>
        </Reveal>
        <div className="vi-table" role="table" aria-label="Comparación de cuerpos">
          <div className="vi-table__row vi-table__row--head" role="row">
            <span role="columnheader" />
            {bodies.map(body => <span key={body.name} role="columnheader">{body.name}</span>)}
          </div>
          {([['Sensor', 'sensor'], ['Video', 'video'], ['Peso', 'weight'], ['Ideal para', 'fit']] as const).map(([label, key]) => <div key={key} className="vi-table__row" role="row">
            <span role="rowheader">{label}</span>
            {bodies.map(body => <span key={body.name} role="cell">{body[key]}</span>)}
          </div>)}
        </div>
      </section>

      <section id="lentes" className="vi-lenses" aria-labelledby="vi-lenses-title">
        <Reveal className="vi-head">
          <h2 id="vi-lenses-title" className="vi-title">{copy.home_42}</h2>
          <p className="vi-head__aside">{copy.home_43}</p>
        </Reveal>
        <div className="vi-lenses__grid">
          <div className="vi-lenses__photo"><img src={photos.p3} alt={copy.home_44} /></div>
          <ul className="vi-lenses__list">
            {lenses.map((lens, index) => <li key={lens.mm}>
              <Reveal delay={index * 60}>
                <a className="vi-lens" href="#equipo">
                  <span className="vi-lens__mm">{lens.mm}</span>
                  <span className="vi-lens__name">{lens.name}</span>
                  <span className="vi-lens__note">{lens.note}</span>
                </a>
              </Reveal>
            </li>)}
          </ul>
        </div>
      </section>

      <section id="taller" className="vi-lab" aria-labelledby="vi-lab-title">
        <div className="vi-lab__photo">
          <Parallax strength={60} mobileStrength={22} className="vi-drift"><img src={photos.taller} alt={copy.home_45} /></Parallax>
        </div>
        <Reveal className="vi-lab__copy">
          <p className="vi-kicker vi-kicker--dark">{copy.home_46}</p>
          <h2 id="vi-lab-title" className="vi-title">{copy.home_47}</h2>
          <p>{copy.home_48}</p>
          <a className="vi-btn" href="#guias">{copy.home_49}</a>
        </Reveal>
      </section>

      <section id="guias" className="vi-guides" aria-labelledby="vi-guides-title">
        <Reveal className="vi-head">
          <h2 id="vi-guides-title" className="vi-title">{copy.home_50}</h2>
        </Reveal>
        <div className="vi-guides__grid">
          {guides.map((guide, index) => <Reveal key={guide.title} delay={index * 60}>
            <article className="vi-guide">
              <h3 className="vi-guide__title">{guide.title}</h3>
              <p className="vi-guide__text">{guide.text}</p>
              <a className="vi-guide__link" href="#equipo">Leer guía →</a>
            </article>
          </Reveal>)}
        </div>
      </section>

      <section id="resenas" className="vi-reviews" aria-labelledby="vi-reviews-title">
        <Reveal className="vi-head">
          <h2 id="vi-reviews-title" className="vi-title">{copy.home_51}</h2>
        </Reveal>
        <div className="vi-reviews__grid">
          <figure className="vi-reviews__photo"><img src={photos.calle} alt={copy.home_52} /></figure>
          <div className="vi-quotes">
            {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
              <figure className="vi-quote">
                <blockquote>{review.quote}</blockquote>
                <figcaption><b>{review.name}</b> · {review.city}</figcaption>
              </figure>
            </Reveal>)}
          </div>
        </div>
      </section>

      <section id="boletin" className="vi-news" aria-labelledby="vi-news-title" data-pagosya-subscribe-block>
        <Reveal className="vi-news__inner">
          <h2 id="vi-news-title" className="vi-news__title">{copy.home_53}</h2>
          <p className="vi-news__text">{copy.home_54}</p>
          <button type="button" className="vi-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="vi-news__field">{copy.home_55}</span>
            <span className="vi-news__submit">{copy.home_56}</span>
          </button>
          <p role="status" className="vi-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
