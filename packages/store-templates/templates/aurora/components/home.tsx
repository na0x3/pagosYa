import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const steps = [
  { title: copy.home_1, body: copy.home_2 },
  { title: copy.home_3, body: copy.home_4 },
  { title: copy.home_5, body: copy.home_6 },
];
const questions = [
  { q: copy.home_7, a: copy.home_8 },
  { q: copy.home_9, a: copy.home_10 },
  { q: copy.home_11, a: copy.home_12 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="au-hero">
        <div className="au-hero__media"><Parallax strength={60} mobileStrength={30} className="au-drift"><img src={photos.hero} alt={`Productos de ${store.name}`} /></Parallax></div>
        <div className="au-hero__copy">
          <p className="au-eyebrow">{copy.home_13}</p>
          <h1 className="au-display">{copy.home_14}</h1>
          <p className="au-lead">{copy.home_15}</p>
          <div className="au-actions"><a className="au-btn" href="#tienda">{copy.home_16}</a><a className="au-link" href="#rutina">{copy.home_17}</a></div>
        </div>
      </section>

      <section id="tienda" className="au-shop" aria-labelledby="au-shop-title">
        <Reveal className="au-shop__head">
          <p className="au-eyebrow">{copy.home_18}</p>
          <h2 id="au-shop-title" className="au-title">{copy.home_19}</h2>
          <p className="au-muted">{copy.home_20}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="au-card">
            <a className="au-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="au-card__body">
              <h3 className="au-card__name" data-product-field="name">Producto</h3>
              <p className="au-card__desc" data-product-field="description" />
              <div className="au-card__row"><span className="au-card__price" data-product-field="price" /><button type="button" className="au-card__add" data-product-add>Agregar</button></div>
            </div>
          </article>
        </template>
        <div className="au-grid" data-pagosya-catalog />
      </section>

      <section id="rutina" className="au-ritual" aria-labelledby="au-ritual-title">
        <Reveal><img className="au-ritual__photo" src={photos.ritual} alt={copy.home_21} /></Reveal>
        <Reveal className="au-ritual__copy" delay={120}>
          <p className="au-eyebrow">{copy.home_22}</p>
          <h2 id="au-ritual-title" className="au-title">{copy.home_23}</h2>
          <ol className="au-steps">{steps.map((step, index) => <li key={step.title}><span className="au-steps__n">{index + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        </Reveal>
      </section>

      <section id="textura" className="au-texture" aria-label="Textura">
        <Parallax strength={90} className="au-drift au-drift--deep"><img src={photos.texture} alt="" aria-hidden="true" /></Parallax>
        <Reveal><p className="au-statement">{copy.home_24}</p></Reveal>
      </section>

      <section id="preguntas" className="au-faq" aria-labelledby="au-faq-title">
        <Reveal><h2 id="au-faq-title" className="au-title">{copy.home_25}</h2></Reveal>
        {questions.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
