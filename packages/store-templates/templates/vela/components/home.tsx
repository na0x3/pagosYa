import { Parallax, Reveal, ScrollScale } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const notes = [copy.home_1, copy.home_2, copy.home_3, copy.home_4, copy.home_5];
const ritual = [
  { title: copy.home_6, body: copy.home_7 },
  { title: copy.home_8, body: copy.home_9 },
  { title: copy.home_10, body: copy.home_11 },
];
const faqs = [
  { q: copy.home_12, a: copy.home_13 },
  { q: copy.home_14, a: copy.home_15 },
  { q: copy.home_16, a: copy.home_17 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="ve-hero">
        <div className="ve-hero__copy">
          <p className="ve-kicker">{copy.home_18}</p>
          <h1 className="ve-display">{copy.home_19}<em>{copy.home_20}</em></h1>
          <p className="ve-lead">{copy.home_21}</p>
          <a className="ve-btn" href="#coleccion">{copy.home_22}</a>
          <ul className="ve-notes" aria-label="Familias de aromas">{notes.map(note => <li key={note}>{note}</li>)}</ul>
        </div>
        <div className="ve-hero__photo"><Parallax strength={60} mobileStrength={14} className="ve-drift"><img src={photos.hero} alt={`Vela de ${store.name}`} /></Parallax></div>
      </section>

      <section id="coleccion" className="ve-shop" aria-labelledby="ve-shop-title">
        <Reveal><h2 id="ve-shop-title" className="ve-title">{copy.home_23}</h2></Reveal>
        <template data-pagosya-product-template>
          <article className="ve-card">
            <a className="ve-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="ve-card__name" data-product-field="name">Aroma</h3>
            <p className="ve-card__desc" data-product-field="description" />
            <div className="ve-card__row"><span className="ve-card__price" data-product-field="price" /><button type="button" className="ve-card__add" data-product-add>Agregar</button></div>
          </article>
        </template>
        <div className="ve-grid" data-pagosya-catalog />
      </section>

      <section id="ritual" className="ve-ritual" aria-labelledby="ve-ritual-title">
        <ScrollScale from={0.86}><img src={photos.ritual} alt={copy.home_24} /></ScrollScale>
        <Reveal delay={120}>
          <h2 id="ve-ritual-title" className="ve-title ve-title--light">{copy.home_25}</h2>
          <ol>{ritual.map((step, index) => <li key={step.title}><span>{['I', 'II', 'III'][index]}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        </Reveal>
      </section>

      <section id="regalos" className="ve-gift" aria-labelledby="ve-gift-title">
        <Reveal>
          <h2 id="ve-gift-title" className="ve-title ve-title--left">{copy.home_26}</h2>
          <p>{copy.home_27}</p>
          <a className="ve-btn ve-btn--plum" href="#coleccion">{copy.home_28}</a>
        </Reveal>
        <Reveal delay={120}><img src={photos.regalo} alt={copy.home_29} /></Reveal>
      </section>

      <section id="preguntas" className="ve-faq" aria-labelledby="ve-faq-title">
        <Reveal><h2 id="ve-faq-title" className="ve-title">{copy.home_30}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
