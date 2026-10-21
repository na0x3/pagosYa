import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const faqs = [
  { q: copy.home_1, a: copy.home_2 },
  { q: copy.home_3, a: copy.home_4 },
  { q: copy.home_5, a: copy.home_6 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="en-hero">
        <div className="en-hero__copy">
          <p className="en-kicker">{copy.home_7}</p>
          <h1 className="en-display">{copy.home_8}<br /><em>{copy.home_9}</em></h1>
          <p className="en-ornament" aria-hidden="true">— ✿ —</p>
          <p className="en-lead">{copy.home_10}</p>
          <a className="en-btn" href="#novedades">{copy.home_11}</a>
        </div>
        <div className="en-hero__arch"><Parallax strength={70} mobileStrength={30} className="en-drift"><img src={photos.hero} alt={`Vestido de ${store.name} en un jardín`} /></Parallax></div>
      </section>

      <section id="novedades" className="en-shop" aria-labelledby="en-shop-title">
        <Reveal className="en-shop__head"><p className="en-kicker">{copy.home_12}</p><h2 id="en-shop-title" className="en-title">{copy.home_13}</h2></Reveal>
        <template data-pagosya-product-template>
          <article className="en-card">
            <a className="en-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la prenda" /></a>
            <h3 className="en-card__name" data-product-field="name">Prenda</h3>
            <p className="en-card__price" data-product-field="price" />
            <button type="button" className="en-card__add" data-product-add>Agregar a mi bolsa</button>
          </article>
        </template>
        <div className="en-grid" data-pagosya-catalog />
      </section>

      <section id="detalles" className="en-lace" aria-label="Detalles">
        <Parallax strength={110} className="en-drift en-drift--deep"><img src={photos.detalle} alt="" aria-hidden="true" /></Parallax>
        <Reveal><p className="en-lace__line">{copy.home_14}<br /><em>{copy.home_15}</em></p></Reveal>
      </section>

      <section id="coleccion" className="en-garden" aria-labelledby="en-garden-title">
        <div className="en-garden__photo"><Parallax strength={60} className="en-drift"><img src={photos.jardin} alt={copy.home_16} /></Parallax></div>
        <Reveal className="en-garden__copy" delay={100}>
          <p className="en-kicker">{copy.home_17}</p>
          <h2 id="en-garden-title" className="en-title">{copy.home_18}</h2>
          <p>{copy.home_19}</p>
          <a className="en-btn en-btn--line" href="#novedades">{copy.home_20}</a>
        </Reveal>
      </section>

      <section id="preguntas" className="en-faq" aria-labelledby="en-faq-title">
        <Reveal><h2 id="en-faq-title" className="en-title">{copy.home_21}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
