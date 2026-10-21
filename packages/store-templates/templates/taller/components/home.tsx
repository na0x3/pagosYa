import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const badges = [copy.home_1, copy.home_2, copy.home_3];
const steps = [
  { t: copy.home_4, b: copy.home_5 },
  { t: copy.home_6, b: copy.home_7 },
  { t: copy.home_8, b: copy.home_9 },
];
const zones = [copy.home_10, copy.home_11, copy.home_12, copy.home_13, copy.home_14, copy.home_15];
const faqs = [
  { q: copy.home_16, a: copy.home_17 },
  { q: copy.home_18, a: copy.home_19 },
  { q: copy.home_20, a: copy.home_21 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="ta-hero">
        <div className="ta-hero__copy">
          <p className="ta-kicker">{copy.home_22}</p>
          <h1 className="ta-display">{copy.home_23}<span>{copy.home_24}</span></h1>
          <p className="ta-lead">{copy.home_25}</p>
          <a className="ta-btn" href="#servicios">{copy.home_26}</a>
          <ul className="ta-badges">{badges.map(badge => <li key={badge}>{badge}</li>)}</ul>
        </div>
        <div className="ta-hero__photo">
          <Parallax strength={120} mobileStrength={50} className="ta-drift"><img src={photos.hero} alt={`Un técnico de ${store.name} trabajando`} /></Parallax>
          <p className="ta-hero__tag">{copy.home_27}</p>
        </div>
      </section>

      <section id="servicios" className="ta-shop" aria-labelledby="ta-shop-title">
        <Reveal className="ta-shop__head"><h2 id="ta-shop-title" className="ta-title">{copy.home_28}</h2><p>{copy.home_29}</p></Reveal>
        <template data-pagosya-product-template>
          <article className="ta-card">
            <a className="ta-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del servicio" /></a>
            <div className="ta-card__body">
              <h3 className="ta-card__name" data-product-field="name">Servicio</h3>
              <p className="ta-card__desc" data-product-field="description" />
              <p className="ta-card__price" data-product-field="price" />
              <button type="button" className="ta-card__add" data-product-add>Pedir servicio</button>
            </div>
          </article>
        </template>
        <div className="ta-grid" data-pagosya-catalog />
      </section>

      <section id="como" className="ta-how" aria-labelledby="ta-how-title">
        <Parallax strength={160} className="ta-drift ta-drift--deep"><img src={photos.herramientas} alt="" aria-hidden="true" /></Parallax>
        <Reveal><h2 id="ta-how-title" className="ta-title ta-title--light">{copy.home_30}</h2></Reveal>
        <Reveal delay={80}><ol>{steps.map((step, index) => <li key={step.t}><span>0{index + 1}</span><h3>{step.t}</h3><p>{step.b}</p></li>)}</ol></Reveal>
      </section>

      <section id="equipo" className="ta-team" aria-labelledby="ta-team-title">
        <Reveal><img src={photos.equipo} alt={copy.home_31} /></Reveal>
        <Reveal delay={80}>
          <p className="ta-kicker">{copy.home_32}</p>
          <h2 id="ta-team-title" className="ta-title">{copy.home_33}</h2>
          <p>{copy.home_34}</p>
          <ul className="ta-zones">{zones.map(zone => <li key={zone}>{zone}</li>)}</ul>
        </Reveal>
      </section>

      <section id="preguntas" className="ta-faq" aria-labelledby="ta-faq-title">
        <Reveal><h2 id="ta-faq-title" className="ta-title">{copy.home_35}</h2></Reveal>
        <div>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
