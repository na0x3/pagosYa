import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const numbers = [
  { value: '12', label: copy.home_1 },
  { value: '240+', label: copy.home_2 },
  { value: '18.500', label: copy.home_3 },
  { value: '190', label: copy.home_4 },
];

const steps = [
  { title: copy.home_5, text: copy.home_6 },
  { title: copy.home_7, text: copy.home_8 },
  { title: copy.home_9, text: copy.home_10 },
  { title: copy.home_11, text: copy.home_12 },
];

const reviews = [
  { quote: copy.home_13, name: copy.home_14, place: copy.home_15 },
  { quote: copy.home_16, name: copy.home_17, place: copy.home_18 },
  { quote: copy.home_19, name: copy.home_20, place: copy.home_21 },
];

const projects = [
  { slot: 'p4', name: copy.home_22, meta: '38 m² · 5 semanas · Achumani', alt: copy.home_23 },
  { slot: 'p2', name: copy.home_24, meta: '96 m² · 8 semanas · Cochabamba', alt: copy.home_25 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="ob-hero" aria-labelledby="ob-hero-title">
        <img className="ob-hero__photo" src={photos.p3} alt={`Obra de ${store.name}: muro de ladrillo en construcción`} />
        <div className="ob-hero__copy">
          <p className="ob-kicker">{copy.home_26}</p>
          <h1 id="ob-hero-title" className="ob-hero__title">{copy.home_27}</h1>
          <p className="ob-hero__lead">{copy.home_28}</p>
          <div className="ob-hero__actions">
            <a className="ob-btn ob-btn--yellow" href="#servicios">{copy.home_29}</a>
            <a className="ob-btn ob-btn--ghost" href="#servicios">{copy.home_30}</a>
          </div>
        </div>
      </section>

      <section id="servicios" className="ob-shop" aria-labelledby="ob-shop-title">
        <Reveal className="ob-head">
          <h2 id="ob-shop-title" className="ob-title">{copy.home_31}</h2>
          <p className="ob-head__aside">{copy.home_32}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ob-card">
            <a className="ob-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del servicio" /></a>
            <div className="ob-card__body">
              <h3 className="ob-card__name" data-product-field="name">Servicio</h3>
              <p className="ob-card__price" data-product-field="price" />
              <button type="button" className="ob-card__add" data-product-add>Agregar</button>
            </div>
          </article>
        </template>
        <div className="ob-grid" data-pagosya-catalog />
      </section>

      <section id="cifras" className="ob-numbers" aria-label="Nuestra trayectoria en cifras">
        <ul className="ob-numbers__list">
          {numbers.map((item, index) => <li key={item.label}>
            <Reveal delay={index * 60}>
              <b className="ob-numbers__value">{item.value}</b>
              <span className="ob-numbers__label">{item.label}</span>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="proyectos" className="ob-projects" aria-labelledby="ob-projects-title">
        <Reveal className="ob-head">
          <h2 id="ob-projects-title" className="ob-title">{copy.home_33}</h2>
          <p className="ob-head__aside">{copy.home_34}</p>
        </Reveal>
        <div className="ob-projects__grid">
          <Reveal className="ob-pair">
            <figure className="ob-pair__side">
              <img src={photos.antes} alt={copy.home_35} />
              <figcaption>{copy.home_36}</figcaption>
            </figure>
            <figure className="ob-pair__side">
              <img src={photos.despues} alt={copy.home_37} />
              <figcaption>{copy.home_38}</figcaption>
            </figure>
            <p className="ob-pair__caption"><b>{copy.home_39}</b>{copy.home_40}</p>
          </Reveal>
          {projects.map((project, index) => <Reveal key={project.slot} delay={(index + 1) * 60} className="ob-project">
            <img src={photos[project.slot]} alt={project.alt} />
            <p className="ob-project__name">{project.name}</p>
            <p className="ob-project__meta">{project.meta}</p>
          </Reveal>)}
        </div>
      </section>

      <section id="proceso" className="ob-process" aria-labelledby="ob-process-title">
        <Parallax strength={70} mobileStrength={24} className="ob-drift"><img src={photos.p1} alt="" aria-hidden="true" /></Parallax>
        <div className="ob-process__inner">
          <Reveal className="ob-head">
            <h2 id="ob-process-title" className="ob-title ob-title--light">{copy.home_41}</h2>
          </Reveal>
          <ol className="ob-steps">
            {steps.map((step, index) => <li key={step.title}>
              <Reveal delay={index * 60}>
                <span className="ob-steps__n">{String(index + 1).padStart(2, '0')}</span>
                <b className="ob-steps__title">{step.title}</b>
                <span className="ob-steps__text">{step.text}</span>
              </Reveal>
            </li>)}
          </ol>
        </div>
      </section>

      <section id="resenas" className="ob-reviews" aria-labelledby="ob-reviews-title">
        <Reveal className="ob-head">
          <h2 id="ob-reviews-title" className="ob-title">{copy.home_42}</h2>
        </Reveal>
        <div className="ob-quotes">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
            <figure className="ob-quote">
              <p className="ob-quote__stars" aria-hidden="true">★★★★★</p>
              <blockquote className="ob-quote__text">{review.quote}</blockquote>
              <figcaption className="ob-quote__who"><b>{review.name}</b> · {review.place}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="cotizar" className="ob-cta" aria-labelledby="ob-cta-title">
        <Reveal className="ob-cta__inner">
          <h2 id="ob-cta-title" className="ob-cta__title">{copy.home_43}</h2>
          <p className="ob-cta__text">{copy.home_44}</p>
          <a className="ob-btn ob-btn--dark" href="#servicios">{copy.home_45}</a>
        </Reveal>
      </section>
    </main>
  </Shell>;
}
