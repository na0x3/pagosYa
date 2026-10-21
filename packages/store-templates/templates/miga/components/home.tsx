import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const process = [
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
      <section id="inicio" className="mi-hero">
        <Parallax strength={50} mobileStrength={20}><figure className="mi-polaroid mi-polaroid--left"><img src={photos.izq} alt={`Horneado de ${store.name}`} /><figcaption>{copy.home_13}</figcaption></figure></Parallax>
        <div className="mi-hero__copy">
          <p className="mi-badge">{copy.home_14}</p>
          <h1 className="mi-display">{copy.home_15}</h1>
          <p className="mi-lead">{copy.home_16}</p>
          <a className="mi-btn" href="#hoy">{copy.home_17}</a>
        </div>
        <Parallax strength={-45} mobileStrength={-15}><figure className="mi-polaroid mi-polaroid--right"><img src={photos.der} alt={copy.home_18} /><figcaption>{copy.home_19}</figcaption></figure></Parallax>
      </section>

      <section id="hoy" className="mi-menu" aria-labelledby="mi-menu-title">
        <Reveal>
          <h2 id="mi-menu-title" className="mi-title">{copy.home_20}</h2>
          <p className="mi-sub">{copy.home_21}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="mi-item">
            <a className="mi-item__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="mi-item__text">
              <div className="mi-item__row"><h3 className="mi-item__name" data-product-field="name">Producto</h3><span className="mi-item__dots" aria-hidden="true" /><span className="mi-item__price" data-product-field="price" /></div>
              <p className="mi-item__desc" data-product-field="description" />
            </div>
            <button type="button" className="mi-item__add" data-product-add aria-label="Agregar a la canasta">+</button>
          </article>
        </template>
        <div className="mi-list" data-pagosya-catalog />
      </section>

      <section id="cocina" className="mi-story" aria-labelledby="mi-story-title">
        <Reveal className="mi-story__photos"><img className="mi-story__a" src={photos.cocina} alt={copy.home_22} /><img className="mi-story__b" src={photos.masa} alt={copy.home_23} /></Reveal>
        <Reveal delay={120}>
          <h2 id="mi-story-title" className="mi-title mi-title--left">{copy.home_24}</h2>
          <ol>{process.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        </Reveal>
      </section>

      <section id="pedidos" className="mi-order" aria-labelledby="mi-order-title">
        <Reveal>
          <h2 id="mi-order-title" className="mi-title">{copy.home_25}</h2>
          <p>{copy.home_26}</p>
        </Reveal>
        <details className="mi-faq"><summary>{copy.home_27}</summary>{faqs.map(item => <div key={item.q}><h3>{item.q}</h3><p>{item.a}</p></div>)}</details>
        <a className="mi-btn mi-btn--pink" href="#hoy">{copy.home_28}</a>
      </section>
    </main>
  </Shell>;
}
