import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const materials = [
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
      <section id="inicio" className="ps-hero">
        <div className="ps-hero__stage"><Parallax strength={60} mobileStrength={20} className="ps-drift"><img src={photos.hero} alt={`Zapatillas de ${store.name}`} /></Parallax></div>
        <div className="ps-hero__copy">
          <h1 className="ps-display">{copy.home_13}</h1>
          <p className="ps-lead">{copy.home_14}</p>
          <div className="ps-actions"><a className="ps-btn" href="#tienda">{copy.home_15}</a><a className="ps-btn ps-btn--ghost" href="#materiales">{copy.home_16}</a></div>
        </div>
      </section>

      <section id="tienda" className="ps-shop" aria-labelledby="ps-shop-title">
        <Reveal className="ps-shop__head"><h2 id="ps-shop-title" className="ps-title">{copy.home_17}</h2><p>{copy.home_18}</p></Reveal>
        <template data-pagosya-product-template>
          <article className="ps-card">
            <a className="ps-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la zapatilla" /></a>
            <div className="ps-card__dots" aria-hidden="true"><span /><span /><span /></div>
            <h3 className="ps-card__name" data-product-field="name">Zapatilla</h3>
            <p className="ps-card__price" data-product-field="price" />
            <button type="button" className="ps-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="ps-grid" data-pagosya-catalog />
      </section>

      <section id="materiales" className="ps-materials" aria-labelledby="ps-mat-title">
        <div className="ps-materials__photo"><Parallax strength={60} className="ps-drift ps-drift--deep"><img src={photos.material} alt={copy.home_19} /></Parallax></div>
        <Reveal className="ps-materials__copy">
          <h2 id="ps-mat-title" className="ps-title">{copy.home_20}</h2>
          <ul>{materials.map(item => <li key={item.t}><h3>{item.t}</h3><p>{item.b}</p></li>)}</ul>
        </Reveal>
      </section>

      <section id="caminar" className="ps-walk" aria-label="Caminando">
        <Parallax strength={80} className="ps-walk__photo"><img src={photos.caminar} alt="" aria-hidden="true" /></Parallax>
        <Reveal className="ps-walk__copy"><p className="ps-walk__line">{copy.home_21}<br />{copy.home_22}</p><a className="ps-btn" href="#tienda">{copy.home_23}</a></Reveal>
      </section>

      <section id="ayuda" className="ps-faq" aria-labelledby="ps-faq-title">
        <Reveal><h2 id="ps-faq-title" className="ps-title">{copy.home_24}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
