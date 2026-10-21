import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const steps = [
  { t: copy.home_1, b: copy.home_2 },
  { t: copy.home_3, b: copy.home_4 },
  { t: copy.home_5, b: copy.home_6 },
];
const faqs = [
  { q: copy.home_7, a: copy.home_8 },
  { q: copy.home_9, a: copy.home_10 },
  { q: copy.home_11, a: copy.home_12 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="pa2-hero">
        <div className="pa2-hero__copy">
          <p className="pa2-kicker">{copy.home_13}</p>
          <h1 className="pa2-display">{copy.home_14}<br /><em>{copy.home_15}</em></h1>
          <p className="pa2-lead">{copy.home_16}</p>
          <div className="pa2-actions"><a className="pa2-btn" href="#clases">{copy.home_17}</a><a className="pa2-link" href="#como">{copy.home_18}</a></div>
        </div>
        <div className="pa2-hero__arch"><Parallax strength={80} mobileStrength={30} className="pa2-drift"><img src={photos.hero} alt={`El estudio de ${store.name}`} /></Parallax></div>
      </section>

      <section id="clases" className="pa2-shop" aria-labelledby="pa2-shop-title">
        <Reveal className="pa2-shop__head">
          <p className="pa2-kicker">{copy.home_19}</p>
          <h2 id="pa2-shop-title" className="pa2-title">{copy.home_20}</h2>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="pa2-card">
            <a className="pa2-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la clase" /></a>
            <div className="pa2-card__body">
              <h3 className="pa2-card__name" data-product-field="name">Clase</h3>
              <p className="pa2-card__desc" data-product-field="description" />
              <div className="pa2-card__row"><span className="pa2-card__price" data-product-field="price" /><button type="button" className="pa2-card__add" data-product-add>Reservar</button></div>
            </div>
          </article>
        </template>
        <div className="pa2-list" data-pagosya-catalog />
      </section>

      <section id="como" className="pa2-how" aria-labelledby="pa2-how-title">
        <Reveal><h2 id="pa2-how-title" className="pa2-title">{copy.home_21}</h2></Reveal>
        <Reveal delay={100}><ol>{steps.map((step, index) => <li key={step.t}><span>{index + 1}</span><h3>{step.t}</h3><p>{step.b}</p></li>)}</ol></Reveal>
      </section>

      <section id="estudio" className="pa2-studio" aria-label="El estudio">
        <Parallax strength={120} className="pa2-drift pa2-drift--deep"><img src={photos.estudio} alt="" aria-hidden="true" /></Parallax>
        <Reveal><p className="pa2-quote">{copy.home_22}</p></Reveal>
      </section>

      <section id="instructoras" className="pa2-team" aria-labelledby="pa2-team-title">
        <Reveal><img src={photos.instructora} alt={copy.home_23} /></Reveal>
        <Reveal delay={120}>
          <p className="pa2-kicker">{copy.home_24}</p>
          <h2 id="pa2-team-title" className="pa2-title">{copy.home_25}</h2>
          <p>{copy.home_26}</p>
        </Reveal>
      </section>

      <section id="preguntas" className="pa2-faq" aria-labelledby="pa2-faq-title">
        <Reveal><h2 id="pa2-faq-title" className="pa2-title">{copy.home_27}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
