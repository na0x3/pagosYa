import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const chips = [copy.home_1, copy.home_2, copy.home_3, copy.home_4];
const materials = [
  { t: copy.home_5, b: copy.home_6 },
  { t: copy.home_7, b: copy.home_8 },
  { t: copy.home_9, b: copy.home_10 },
];
const faqs = [
  { q: copy.home_11, a: copy.home_12 },
  { q: copy.home_13, a: copy.home_14 },
  { q: copy.home_15, a: copy.home_16 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="tz-hero">
        <div className="tz-hero__frame"><Parallax strength={90} mobileStrength={30} className="tz-drift"><img src={photos.hero} alt={`Accesorios de ${store.name} en un escritorio`} /></Parallax></div>
        <Reveal className="tz-hero__card">
          <p className="tz-kicker">{copy.home_17}</p>
          <h1 className="tz-display">{copy.home_18}</h1>
          <p className="tz-lead">{copy.home_19}</p>
          <a className="tz-btn" href="#productos">{copy.home_20}</a>
        </Reveal>
      </section>

      <Reveal><ul className="tz-chips" aria-label="Categorías">{chips.map(chip => <li key={chip}><a href="#productos">{chip}</a></li>)}</ul></Reveal>

      <section id="productos" className="tz-shop" aria-labelledby="tz-shop-title">
        <Reveal className="tz-shop__head"><h2 id="tz-shop-title" className="tz-title">{copy.home_21}</h2><p>{copy.home_22}</p></Reveal>
        <template data-pagosya-product-template>
          <article className="tz-card">
            <a className="tz-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="tz-card__name" data-product-field="name">Producto</h3>
            <p className="tz-card__desc" data-product-field="description" />
            <div className="tz-card__row"><span className="tz-card__price" data-product-field="price" /><button type="button" className="tz-card__add" data-product-add>Agregar</button></div>
          </article>
        </template>
        <div className="tz-grid" data-pagosya-catalog />
      </section>

      <section id="materiales" className="tz-materials" aria-labelledby="tz-mat-title">
        <Reveal><h2 id="tz-mat-title" className="tz-title">{copy.home_23}</h2></Reveal>
        <Reveal delay={100}><ul>{materials.map((item, index) => <li key={item.t}><span>{String(index + 1).padStart(2, '0')}</span><h3>{item.t}</h3><p>{item.b}</p></li>)}</ul></Reveal>
      </section>

      <section id="casa-y-viaje" className="tz-life" aria-labelledby="tz-life-title">
        <Reveal className="tz-life__copy">
          <p className="tz-kicker">{copy.home_24}</p>
          <h2 id="tz-life-title" className="tz-title">{copy.home_25}</h2>
          <p>{copy.home_26}</p>
          <a className="tz-btn tz-btn--ghost" href="#productos">{copy.home_27}</a>
        </Reveal>
        <div className="tz-life__photos">
          <Parallax strength={40} className="tz-life__a"><img src={photos.casa} alt={copy.home_28} /></Parallax>
          <Parallax strength={-50} className="tz-life__b"><img src={photos.viaje} alt={copy.home_29} /></Parallax>
        </div>
      </section>

      <section id="ayuda" className="tz-faq" aria-labelledby="tz-faq-title">
        <Reveal><h2 id="tz-faq-title" className="tz-title">{copy.home_30}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
