import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const steps = [
  { title: copy.home_1, body: copy.home_2 },
  { title: copy.home_3, body: copy.home_4 },
  { title: copy.home_5, body: copy.home_6 },
  { title: copy.home_7, body: copy.home_8 },
];
const faqs = [
  { q: copy.home_9, a: copy.home_10 },
  { q: copy.home_11, a: copy.home_12 },
  { q: copy.home_13, a: copy.home_14 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="ba-hero">
        <div className="ba-hero__copy">
          <p className="ba-kicker">{copy.home_15}</p>
          <h1 className="ba-display">{copy.home_16}<span className="ba-scribble">alma<svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true"><path d="M2 14 C40 4 80 18 120 9 C150 3 175 12 198 6" /></svg></span>{copy.home_17}</h1>
          <p className="ba-lead">{copy.home_18}</p>
          <a className="ba-btn" href="#piezas">{copy.home_19}</a>
        </div>
        <div className="ba-hero__blob"><Parallax strength={60} mobileStrength={30} className="ba-drift"><img src={photos.hero} alt={`Pieza de ${store.name}`} /></Parallax></div>
      </section>

      <section id="piezas" className="ba-shop" aria-labelledby="ba-shop-title">
        <Reveal>
          <h2 id="ba-shop-title" className="ba-title">{copy.home_20}</h2>
          <p className="ba-sub">{copy.home_21}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ba-card">
            <a className="ba-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="ba-card__name" data-product-field="name">Pieza</h3>
            <p className="ba-card__price" data-product-field="price" />
            <button type="button" className="ba-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ba-grid" data-pagosya-catalog />
      </section>

      <section id="proceso" className="ba-process" aria-labelledby="ba-process-title">
        <Parallax strength={100} className="ba-drift ba-drift--deep"><img src={photos.manos} alt={copy.home_22} /></Parallax>
        <Reveal><h2 id="ba-process-title" className="ba-title ba-title--light">{copy.home_23}</h2></Reveal>
        <Reveal delay={120}><ol>{steps.map((step, index) => <li key={step.title}><span>{index + 1}</span><h3>{step.title}</h3><p>{step.body}</p></li>)}</ol></Reveal>
      </section>

      <section id="taller" className="ba-maker" aria-labelledby="ba-maker-title">
        <Reveal><img src={photos.taller} alt={copy.home_24} /></Reveal>
        <Reveal delay={120}>
          <p className="ba-kicker">{copy.home_25}</p>
          <h2 id="ba-maker-title" className="ba-title">{copy.home_26}</h2>
          <p>{copy.home_27}</p>
          <p className="ba-sign">— {store.name}</p>
        </Reveal>
      </section>

      <section id="preguntas" className="ba-faq" aria-labelledby="ba-faq-title">
        <Reveal><h2 id="ba-faq-title" className="ba-title">{copy.home_28}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
