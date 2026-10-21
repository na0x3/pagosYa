import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const perks = [copy.home_1, copy.home_2, copy.home_3];
const steps = [
  { title: copy.home_4, body: copy.home_5 },
  { title: copy.home_6, body: copy.home_7 },
  { title: copy.home_8, body: copy.home_9 },
];
const faqs = [
  { q: copy.home_10, a: copy.home_11 },
  { q: copy.home_12, a: copy.home_13 },
  { q: copy.home_14, a: copy.home_15 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="ri-hero">
        <div className="ri-hero__copy">
          <h1 className="ri-display">{copy.home_16}<br /><span>{copy.home_17}</span> fuerte</h1>
          <ul className="ri-perks">{perks.map(perk => <li key={perk}>{perk}</li>)}</ul>
          <a className="ri-btn" href="#productos">{copy.home_18}</a>
        </div>
        <div className="ri-hero__product"><Parallax strength={150} mobileStrength={50} className="ri-hero__float"><img src={photos.hero} alt={`Producto de ${store.name}`} /></Parallax></div>
      </section>

      <section id="productos" className="ri-shop" aria-labelledby="ri-shop-title">
        <Reveal><h2 id="ri-shop-title" className="ri-title">{copy.home_19}</h2></Reveal>
        <template data-pagosya-product-template>
          <article className="ri-card">
            <a className="ri-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="ri-card__band" aria-hidden="true" />
            <h3 className="ri-card__name" data-product-field="name">Producto</h3>
            <p className="ri-card__desc" data-product-field="description" />
            <div className="ri-card__row"><span className="ri-card__price" data-product-field="price" /><button type="button" className="ri-card__add" data-product-add>Agregar</button></div>
          </article>
        </template>
        <div className="ri-grid" data-pagosya-catalog />
      </section>

      <section id="uso" className="ri-use" aria-labelledby="ri-use-title">
        <Reveal><img src={photos.accion} alt={copy.home_20} /></Reveal>
        <Reveal delay={80}>
          <h2 id="ri-use-title" className="ri-title ri-title--left">{copy.home_21}</h2>
          <ol>{steps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        </Reveal>
      </section>

      <section id="preguntas" className="ri-faq" aria-labelledby="ri-faq-title">
        <Reveal><h2 id="ri-faq-title" className="ri-title">{copy.home_22}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
