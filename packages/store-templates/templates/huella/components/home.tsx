import { Parallax, Reveal } from '@pagosya/ui';
import Shell, { Paw } from './Shell';
import { store, photos, copy } from './store-data';

const tips = [
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
      <section id="inicio" className="hl-hero">
        <div className="hl-hero__copy">
          <h1 className="hl-display">{copy.home_13}</h1>
          <p className="hl-lead">{copy.home_14}</p>
          <a className="hl-btn" href="#productos">{copy.home_15}</a>
        </div>
        <div className="hl-hero__media">
          <div className="hl-hero__frame"><Parallax strength={60} mobileStrength={20} className="hl-drift"><img src={photos.hero} alt={`Productos de ${store.name}`} /></Parallax></div>
          <Parallax strength={-70} mobileStrength={-15} className="hl-paws"><Paw className="hl-paw hl-paw--a" /><Paw className="hl-paw hl-paw--b" /><Paw className="hl-paw hl-paw--c" /></Parallax>
        </div>
      </section>

      <section id="tipos" className="hl-types" aria-label="Compra por mascota">
        <Reveal><a href="#productos" className="hl-type hl-type--dog"><img src={photos.perros} alt={copy.home_16} /><span>{copy.home_17}</span></a></Reveal>
        <Reveal delay={120}><a href="#productos" className="hl-type hl-type--cat"><img src={photos.gatos} alt={copy.home_18} /><span>{copy.home_19}</span></a></Reveal>
      </section>

      <section id="productos" className="hl-shop" aria-labelledby="hl-shop-title">
        <Reveal><h2 id="hl-shop-title" className="hl-title">{copy.home_20}</h2></Reveal>
        <template data-pagosya-product-template>
          <article className="hl-card">
            <a className="hl-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="hl-card__name" data-product-field="name">Producto</h3>
            <p className="hl-card__desc" data-product-field="description" />
            <div className="hl-card__row"><span className="hl-card__price" data-product-field="price" /><button type="button" className="hl-card__add" data-product-add>Agregar</button></div>
          </article>
        </template>
        <div className="hl-grid" data-pagosya-catalog />
      </section>

      <section id="consejos" className="hl-tips" aria-labelledby="hl-tips-title">
        <Reveal><h2 id="hl-tips-title" className="hl-title hl-title--light">{copy.home_21}</h2></Reveal>
        <Reveal delay={100}><ul>{tips.map(tip => <li key={tip.title}><Paw className="hl-tips__paw" /><h3>{tip.title}</h3><p>{tip.body}</p></li>)}</ul></Reveal>
      </section>

      <section id="preguntas" className="hl-faq" aria-labelledby="hl-faq-title">
        <Reveal><h2 id="hl-faq-title" className="hl-title">{copy.home_22}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
