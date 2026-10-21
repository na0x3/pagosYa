import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const ages = ['0 a 2 años', '3 a 5 años', '6 a 8 años', '9 años o más'];
const values = [
  { title: copy.home_1, body: copy.home_2, color: 'red' },
  { title: copy.home_3, body: copy.home_4, color: 'blue' },
  { title: copy.home_5, body: copy.home_6, color: 'green' },
];
const faqs = [
  { q: copy.home_7, a: copy.home_8 },
  { q: copy.home_9, a: copy.home_10 },
  { q: copy.home_11, a: copy.home_12 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="ju-hero">
        <Parallax strength={-90} className="ju-blobs"><span className="ju-blob ju-blob--red" aria-hidden="true" /><span className="ju-blob ju-blob--blue" aria-hidden="true" /><span className="ju-blob ju-blob--green" aria-hidden="true" /></Parallax>
        <div className="ju-hero__copy">
          <h1 className="ju-display">{copy.home_13}</h1>
          <p className="ju-lead">{copy.home_14}</p>
          <a className="ju-btn" href="#juguetes">{copy.home_15}</a>
        </div>
        <div className="ju-hero__photo"><Parallax strength={60} mobileStrength={20} className="ju-drift"><img src={photos.hero} alt={`Juguetes de ${store.name}`} /></Parallax></div>
      </section>

      <section id="edades" className="ju-ages" aria-labelledby="ju-ages-title">
        <h2 id="ju-ages-title" className="ju-small">{copy.home_16}</h2>
        <Reveal><ul>{ages.map(age => <li key={age}><a href="#juguetes">{age}</a></li>)}</ul></Reveal>
      </section>

      <section id="juguetes" className="ju-shop" aria-labelledby="ju-shop-title">
        <Reveal><h2 id="ju-shop-title" className="ju-title">{copy.home_17}</h2></Reveal>
        <template data-pagosya-product-template>
          <article className="ju-card">
            <a className="ju-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="ju-card__name" data-product-field="name">Juguete</h3>
            <p className="ju-card__price" data-product-field="price" />
            <button type="button" className="ju-card__add" data-product-add>¡Lo quiero!</button>
          </article>
        </template>
        <div className="ju-grid" data-pagosya-catalog />
      </section>

      <section id="valores" className="ju-values" aria-labelledby="ju-values-title">
        <Reveal><img src={photos.juego} alt={copy.home_18} /></Reveal>
        <Reveal delay={120}>
          <h2 id="ju-values-title" className="ju-title ju-title--left">{copy.home_19}</h2>
          <ul>{values.map(item => <li key={item.title} className={`ju-values__${item.color}`}><h3>{item.title}</h3><p>{item.body}</p></li>)}</ul>
        </Reveal>
      </section>

      <section id="preguntas" className="ju-faq" aria-labelledby="ju-faq-title">
        <Reveal><h2 id="ju-faq-title" className="ju-title">{copy.home_20}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
