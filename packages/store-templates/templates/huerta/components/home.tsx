import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const chips = [copy.home_1, copy.home_2, copy.home_3, copy.home_4, copy.home_5, copy.home_6];
const route = [
  { title: copy.home_7, body: copy.home_8 },
  { title: copy.home_9, body: copy.home_10 },
  { title: copy.home_11, body: copy.home_12 },
];
const faqs = [
  { q: copy.home_13, a: copy.home_14 },
  { q: copy.home_15, a: copy.home_16 },
  { q: copy.home_17, a: copy.home_18 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="hu-hero">
        <div className="hu-hero__photo"><Parallax strength={80} mobileStrength={30} className="hu-drift"><img src={photos.hero} alt={`Productos frescos de ${store.name}`} /></Parallax></div>
        <div className="hu-hero__copy">
          <p className="hu-tag">{copy.home_19}</p>
          <h1 className="hu-display">{copy.home_20}</h1>
          <p className="hu-lead">{copy.home_21}</p>
          <div className="hu-actions"><a className="hu-btn" href="#productos">{copy.home_22}</a><a className="hu-link" href="#canasta">{copy.home_23}</a></div>
          <ul className="hu-chips" aria-label="Lo que encontrarás">{chips.map(chip => <li key={chip}>{chip}</li>)}</ul>
        </div>
      </section>

      <section id="productos" className="hu-shop" aria-labelledby="hu-shop-title">
        <Reveal className="hu-shop__head"><h2 id="hu-shop-title" className="hu-title">{copy.home_24}</h2><p>{copy.home_25}</p></Reveal>
        <template data-pagosya-product-template>
          <article className="hu-card">
            <a className="hu-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="hu-card__body">
              <h3 className="hu-card__name" data-product-field="name">Producto</h3>
              <p className="hu-card__desc" data-product-field="description" />
              <div className="hu-card__row"><span className="hu-card__price" data-product-field="price" /><button type="button" className="hu-card__add" data-product-add>Agregar</button></div>
            </div>
          </article>
        </template>
        <div className="hu-grid" data-pagosya-catalog />
      </section>

      <section id="origen" className="hu-route" aria-labelledby="hu-route-title">
        <Reveal><img src={photos.campo} alt={copy.home_26} /></Reveal>
        <Reveal delay={120}>
          <h2 id="hu-route-title" className="hu-title">{copy.home_27}</h2>
          <ol>{route.map((step, index) => <li key={step.title}><span className="hu-route__dot">{index + 1}</span><h3>{step.title}</h3><p>{step.body}</p></li>)}</ol>
        </Reveal>
      </section>

      <section id="canasta" className="hu-box" aria-labelledby="hu-box-title">
        <Reveal>
          <p className="hu-tag hu-tag--light">{copy.home_28}</p>
          <h2 id="hu-box-title" className="hu-title hu-title--light">{copy.home_29}</h2>
          <p>{copy.home_30}</p>
          <a className="hu-btn hu-btn--light" href="#productos">{copy.home_31}</a>
        </Reveal>
        <Reveal delay={120}><img src={photos.canasta} alt={copy.home_32} /></Reveal>
      </section>

      <section id="preguntas" className="hu-faq" aria-labelledby="hu-faq-title">
        <Reveal><h2 id="hu-faq-title" className="hu-title">{copy.home_33}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
