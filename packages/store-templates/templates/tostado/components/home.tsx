import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const steps = [
  { title: copy.home_1, body: copy.home_2 },
  { title: copy.home_3, body: copy.home_4 },
  { title: copy.home_5, body: copy.home_6 },
];
const faqs = [
  { q: copy.home_7, a: copy.home_8 },
  { q: copy.home_9, a: copy.home_10 },
  { q: copy.home_11, a: copy.home_12 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="tv-hero">
        <div className="tv-hero__copy">
          <p className="tv-kicker">{copy.home_13}</p>
          <h1 className="tv-display">{copy.home_14}</h1>
          <p className="tv-lead">{copy.home_15}</p>
          <a className="tv-btn" href="#cafes">{copy.home_16}</a>
        </div>
        <div className="tv-hero__photo"><Parallax strength={150} mobileStrength={50} className="tv-drift"><img src={photos.hero} alt={`Café de ${store.name}`} /></Parallax></div>
      </section>

      <section id="cafes" className="tv-row" aria-labelledby="tv-cafes">
        <Reveal className="tv-row__intro">
          <h2 id="tv-cafes" className="tv-title">{copy.home_17}</h2>
          <p>{copy.home_18}</p>
          <a className="tv-btn tv-btn--small" href="#cafes-lista">{copy.home_19}</a>
        </Reveal>
        <div className="tv-rail" id="cafes-lista">
          <template data-pagosya-product-template>
            <article className="tv-card">
              <a className="tv-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /><span className="tv-card__badge">Favorito</span></a>
              <h3 className="tv-card__name" data-product-field="name">Café</h3>
              <p className="tv-card__notes" data-product-field="description" />
              <div className="tv-card__foot"><span className="tv-card__price" data-product-field="price" /><button type="button" className="tv-card__add" data-product-add>Agregar</button></div>
            </article>
          </template>
          <div className="tv-rail__track" data-pagosya-catalog />
        </div>
      </section>

      <section id="origen" className="tv-split" aria-labelledby="tv-origen">
        <Reveal className="tv-split__copy">
          <p className="tv-kicker">{copy.home_20}</p>
          <h2 id="tv-origen" className="tv-title">{copy.home_21}</h2>
          <ol className="tv-steps">{steps.map((step, index) => <li key={step.title}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        </Reveal>
        <div className="tv-split__photo"><Parallax strength={200} className="tv-drift tv-drift--deep"><img src={photos.origen} alt={copy.home_22} /></Parallax></div>
      </section>

      <section id="suscripcion" className="tv-sub" aria-labelledby="tv-sub">
        <Reveal><img src={photos.taza} alt="" aria-hidden="true" /></Reveal>
        <Reveal delay={80}>
          <h2 id="tv-sub" className="tv-title">{copy.home_23}</h2>
          <p>{copy.home_24}</p>
          <a className="tv-btn" href="#cafes">{copy.home_25}</a>
        </Reveal>
      </section>

      <section id="preguntas" className="tv-faq" aria-labelledby="tv-faq">
        <Reveal><h2 id="tv-faq" className="tv-title">{copy.home_26}</h2></Reveal>
        <div>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
