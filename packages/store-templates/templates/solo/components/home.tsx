import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const trust = [copy.home_1, copy.home_2, copy.home_3];
const benefits = [
  { title: copy.home_4, body: copy.home_5 },
  { title: copy.home_6, body: copy.home_7 },
  { title: copy.home_8, body: copy.home_9 },
];
const steps = [
  { title: copy.home_10, body: copy.home_11 },
  { title: copy.home_12, body: copy.home_13 },
  { title: copy.home_14, body: copy.home_15 },
];
const faqs = [
  { q: copy.home_16, a: copy.home_17 },
  { q: copy.home_18, a: copy.home_19 },
  { q: copy.home_20, a: copy.home_21 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="comprar" className="so-hero">
        <div className="so-gallery">
          <img className="so-gallery__main" src={photos.hero} alt={`Producto de ${store.name}`} />
          <div className="so-gallery__thumbs"><img src={photos.vista2} alt={copy.home_22} /><img src={photos.vista3} alt={copy.home_23} /><img src={photos.vista4} alt={copy.home_24} /></div>
        </div>
        <div className="so-buy">
          <p className="so-eyebrow">{store.name}</p>
          <h1 className="so-h1">{store.tagline || copy.home_25}</h1>
          <template data-pagosya-product-template>
            <article className="so-box">
              <h2 className="so-box__name" data-product-field="name">Producto</h2>
              <p className="so-box__desc" data-product-field="description" />
              <p className="so-box__options" data-product-field="options" />
              <p className="so-box__price" data-product-field="price" />
              <button type="button" className="so-box__add" data-product-add>Agregar al carrito</button>
              <a className="so-box__more" data-product-link href="product.html">Ver todos los detalles</a>
            </article>
          </template>
          <div className="so-offers" data-pagosya-catalog />
          <ul className="so-trust">{trust.map(item => <li key={item}>{item}</li>)}</ul>
        </div>
      </section>

      <section id="beneficios" className="so-benefits" aria-labelledby="so-benefits-title">
        <Reveal><h2 id="so-benefits-title" className="so-title">{copy.home_26}</h2></Reveal>
        <Reveal delay={80}><ul>{benefits.map((item, index) => <li key={item.title}><span aria-hidden="true">{['◐', '◆', '●'][index]}</span><h3>{item.title}</h3><p>{item.body}</p></li>)}</ul></Reveal>
      </section>

      <section id="uso" className="so-how" aria-labelledby="so-how-title">
        <div className="so-how__photo"><Parallax strength={120} mobileStrength={50} className="so-drift"><img src={photos.uso} alt={copy.home_27} /></Parallax></div>
        <Reveal delay={80}>
          <h2 id="so-how-title" className="so-title so-title--left">{copy.home_28}</h2>
          <ol>{steps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        </Reveal>
      </section>

      <section id="preguntas" className="so-faq" aria-labelledby="so-faq-title">
        <Reveal><h2 id="so-faq-title" className="so-title">{copy.home_29}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>

      <section id="cierre" className="so-cta" aria-labelledby="so-cta-title">
        <Reveal><h2 id="so-cta-title">{copy.home_30}</h2></Reveal>
        <a className="so-btn" href="#comprar">{copy.home_31}</a>
      </section>
    </main>
  </Shell>;
}
