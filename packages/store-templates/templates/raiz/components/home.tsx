import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const values = [
  { n: '100%', t: copy.home_1, b: copy.home_2 },
  { n: copy.home_3, t: copy.home_4, b: copy.home_5 },
  { n: copy.home_6, t: copy.home_7, b: copy.home_8 },
];
const faqs = [
  { q: copy.home_9, a: copy.home_10 },
  { q: copy.home_11, a: copy.home_12 },
  { q: copy.home_13, a: copy.home_14 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="ra-hero">
        <div className="ra-hero__photo"><Parallax strength={120} mobileStrength={40} className="ra-drift ra-drift--deep"><img src={photos.hero} alt={`Piezas de ${store.name} sobre una mesa`} /></Parallax></div>
        <Reveal className="ra-hero__card">
          <p className="ra-kicker">{copy.home_15}</p>
          <h1 className="ra-display">{copy.home_16}</h1>
          <p className="ra-lead">{copy.home_17}</p>
          <a className="ra-btn" href="#tienda">{copy.home_18}</a>
        </Reveal>
      </section>

      <section id="valores" className="ra-values" aria-label="Lo que nos importa">
        {values.map((item, index) => <Reveal key={item.t} delay={index * 80}><article><p className="ra-values__n">{item.n}</p><h2>{item.t}</h2><p>{item.b}</p></article></Reveal>)}
      </section>

      <section id="tienda" className="ra-shop" aria-labelledby="ra-shop-title">
        <Reveal className="ra-shop__head"><p className="ra-kicker">{copy.home_19}</p><h2 id="ra-shop-title" className="ra-title">{copy.home_20}</h2></Reveal>
        <template data-pagosya-product-template>
          <article className="ra-card">
            <a className="ra-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <p className="ra-card__maker">Taller artesanal</p>
            <h3 className="ra-card__name" data-product-field="name">Producto</h3>
            <p className="ra-card__price" data-product-field="price" />
            <button type="button" className="ra-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ra-grid" data-pagosya-catalog />
      </section>

      <section id="manos" className="ra-maker" aria-labelledby="ra-maker-title">
        <div className="ra-maker__photo"><Parallax strength={70} className="ra-drift"><img src={photos.artesana} alt={copy.home_21} /></Parallax></div>
        <Reveal delay={100}>
          <p className="ra-kicker">{copy.home_22}</p>
          <h2 id="ra-maker-title" className="ra-title">{copy.home_23}</h2>
          <p>{copy.home_24}</p>
        </Reveal>
      </section>

      <section id="hecho-despacio" className="ra-band" aria-label="El taller">
        <Parallax strength={150} className="ra-drift ra-drift--deep"><img src={photos.taller} alt="" aria-hidden="true" /></Parallax>
        <Reveal><p className="ra-band__line">{copy.home_25}<br />{copy.home_26}</p></Reveal>
      </section>

      <section id="preguntas" className="ra-faq" aria-labelledby="ra-faq-title">
        <Reveal><h2 id="ra-faq-title" className="ra-title">{copy.home_27}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
