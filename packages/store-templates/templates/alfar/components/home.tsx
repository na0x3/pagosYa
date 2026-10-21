import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const floating = [
  { slot: 'p1', className: 'af-float af-float--a', alt: copy.home_1 },
  { slot: 'p2', className: 'af-float af-float--b', alt: copy.home_2 },
  { slot: 'p3', className: 'af-float af-float--c', alt: copy.home_3 },
  { slot: 'p4', className: 'af-float af-float--d', alt: copy.home_4 },
];

const steps = [
  { n: '01', title: copy.home_5, text: copy.home_6 },
  { n: '02', title: copy.home_7, text: copy.home_8 },
  { n: '03', title: copy.home_9, text: copy.home_10 },
  { n: '04', title: copy.home_11, text: copy.home_12 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="af-hero" aria-labelledby="af-hero-title">
        <div className="af-hero__stage">
          <span className="af-hero__blob" aria-hidden="true" />
          <div className="af-hero__copy">
            <h1 id="af-hero-title" className="af-hero__title">{copy.home_13}</h1>
            <p className="af-hero__lead">{copy.home_14}{store.name}.</p>
            <a className="af-link" href="#piezas">{copy.home_15}</a>
          </div>
          {floating.map(item => <img key={item.slot} className={item.className} src={photos[item.slot]} alt={item.alt} />)}
        </div>
        <p className="af-hero__foot">{copy.home_16}</p>
      </section>

      <section id="piezas" className="af-shop" aria-labelledby="af-shop-title">
        <Reveal className="af-head">
          <h2 id="af-shop-title" className="af-title">{copy.home_17}</h2>
          <p className="af-head__aside">{copy.home_18}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="af-card">
            <a className="af-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la pieza" /></a>
            <h3 className="af-card__name" data-product-field="name">Pieza</h3>
            <p className="af-card__price" data-product-field="price" />
            <button type="button" className="af-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="af-grid" data-pagosya-catalog />
      </section>

      <section id="proceso" className="af-process" aria-labelledby="af-process-title">
        <Reveal className="af-head">
          <h2 id="af-process-title" className="af-title">{copy.home_19}</h2>
        </Reveal>
        <ol className="af-steps">
          {steps.map((step, index) => <li key={step.n}>
            <Reveal delay={index * 60}>
              <span className="af-steps__n">{step.n}</span>
              <b className="af-steps__title">{step.title}</b>
              <span className="af-steps__text">{step.text}</span>
            </Reveal>
          </li>)}
        </ol>
      </section>

      <section id="coleccion" className="af-collection" aria-label="Colección">
        <Parallax strength={70} mobileStrength={24} className="af-drift"><img src={photos.mesa} alt={copy.home_20} /></Parallax>
        <Reveal className="af-collection__cap"><p>{copy.home_21}</p></Reveal>
      </section>

      <section id="taller" className="af-workshop" aria-labelledby="af-workshop-title">
        <div className="af-workshop__photo"><img src={photos.taller} alt={copy.home_22} /></div>
        <Reveal className="af-workshop__copy">
          <p className="af-kicker">{copy.home_23}</p>
          <h2 id="af-workshop-title" className="af-title">{copy.home_24}</h2>
          <p>{copy.home_25}</p>
        </Reveal>
      </section>

      <section id="pedidos" className="af-custom" aria-labelledby="af-custom-title">
        <Reveal className="af-custom__inner">
          <h2 id="af-custom-title" className="af-custom__title">{copy.home_26}</h2>
          <p className="af-custom__text">{copy.home_27}</p>
          <a className="af-link af-link--light" href="#piezas">{copy.home_28}</a>
        </Reveal>
      </section>

      <section id="boletin" className="af-news" aria-labelledby="af-news-title" data-pagosya-subscribe-block>
        <Reveal className="af-news__inner">
          <h2 id="af-news-title" className="af-news__title">{copy.home_29}</h2>
          <p className="af-news__text">{copy.home_30}</p>
          <button type="button" className="af-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="af-news__field">{copy.home_31}</span>
            <span className="af-news__submit">{copy.home_32}</span>
          </button>
          <p role="status" className="af-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
