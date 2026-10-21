import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const specs = [
  { k: '01', t: copy.home_1, b: copy.home_2 },
  { k: '02', t: copy.home_3, b: copy.home_4 },
  { k: '03', t: copy.home_5, b: copy.home_6 },
];
const faqs = [
  { q: copy.home_7, a: copy.home_8 },
  { q: copy.home_9, a: copy.home_10 },
  { q: copy.home_11, a: copy.home_12 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="pt-hero">
        <div className="pt-hero__copy">
          <p className="pt-mono pt-kicker"><span className="pt-red" aria-hidden="true">●</span>{copy.home_13}</p>
          <h1 className="pt-display">{copy.home_14}<br />{copy.home_15}</h1>
          <p className="pt-lead">{copy.home_16}</p>
          <a className="pt-btn" href="#productos">{copy.home_17}</a>
        </div>
        <div className="pt-hero__stage">
          <Parallax strength={70} mobileStrength={30} className="pt-hero__float"><img src={photos.hero} alt={`Producto destacado de ${store.name}`} /></Parallax>
          <p className="pt-mono pt-tag pt-tag--a" aria-hidden="true">{copy.home_18}</p>
          <p className="pt-mono pt-tag pt-tag--b" aria-hidden="true">[ 30 h ]</p>
        </div>
      </section>

      <section id="productos" className="pt-shop" aria-labelledby="pt-shop-title">
        <Reveal className="pt-shop__head"><h2 id="pt-shop-title" className="pt-title">{copy.home_19}</h2><p className="pt-mono">{copy.home_20}</p></Reveal>
        <template data-pagosya-product-template>
          <article className="pt-card">
            <a className="pt-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="pt-card__body">
              <h3 className="pt-card__name" data-product-field="name">Producto</h3>
              <p className="pt-card__desc" data-product-field="description" />
              <div className="pt-card__row"><span className="pt-mono pt-card__price" data-product-field="price" /><button type="button" className="pt-card__add" data-product-add>Agregar</button></div>
            </div>
          </article>
        </template>
        <div className="pt-grid" data-pagosya-catalog />
      </section>

      <section id="diseno" className="pt-detail" aria-labelledby="pt-detail-title">
        <div className="pt-detail__photo"><Parallax strength={110} className="pt-drift pt-drift--deep"><img src={photos.detalle} alt={copy.home_21} /></Parallax></div>
        <Reveal className="pt-detail__copy">
          <p className="pt-mono pt-kicker">{copy.home_22}</p>
          <h2 id="pt-detail-title" className="pt-title pt-title--light">{copy.home_23}</h2>
          <ol className="pt-specs">{specs.map(spec => <li key={spec.k}><span className="pt-mono">{spec.k}</span><div><h3>{spec.t}</h3><p>{spec.b}</p></div></li>)}</ol>
        </Reveal>
      </section>

      <section id="calle" className="pt-street" aria-label="En la calle">
        <Parallax strength={140} className="pt-drift pt-drift--deep"><img src={photos.calle} alt="" aria-hidden="true" /></Parallax>
        <Reveal><p className="pt-street__line">{copy.home_24}<br />{copy.home_25}</p></Reveal>
      </section>

      <section id="ayuda" className="pt-faq" aria-labelledby="pt-faq-title">
        <Reveal><h2 id="pt-faq-title" className="pt-title">{copy.home_26}</h2></Reveal>
        <div>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
