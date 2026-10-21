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
      <section id="inicio" className="ar-hero">
        <div className="ar-hero__photo"><Parallax strength={70} mobileStrength={30} className="ar-drift"><img src={photos.hero} alt={`Joyas de ${store.name}`} /></Parallax></div>
        <div className="ar-hero__copy">
          <p className="ar-kicker">{copy.home_7}</p>
          <h1 className="ar-display">{copy.home_8}<em>{copy.home_9}</em></h1>
          <p className="ar-lead">{copy.home_10}</p>
          <a className="ar-btn" href="#joyas">{copy.home_11}</a>
        </div>
      </section>

      <section id="categorias" className="ar-cats" aria-label="Categorías">
        <Reveal><a href="#joyas"><img src={photos.p1} alt={copy.home_12} /><span>{copy.home_13}</span></a></Reveal>
        <Reveal delay={80}><a href="#joyas"><img src={photos.p2} alt={copy.home_14} /><span>{copy.home_15}</span></a></Reveal>
        <Reveal delay={160}><a href="#joyas"><img src={photos.p3} alt={copy.home_16} /><span>{copy.home_17}</span></a></Reveal>
      </section>

      <section id="joyas" className="ar-shop" aria-labelledby="ar-shop-title">
        <Reveal className="ar-shop__head"><h2 id="ar-shop-title" className="ar-title">{copy.home_18}</h2></Reveal>
        <template data-pagosya-product-template>
          <article className="ar-card">
            <a className="ar-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la joya" /></a>
            <h3 className="ar-card__name" data-product-field="name">Joya</h3>
            <p className="ar-card__price" data-product-field="price" />
            <button type="button" className="ar-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ar-grid" data-pagosya-catalog />
      </section>

      <section id="combinalas" className="ar-stack" aria-label="Combínalas">
        <Parallax strength={100} className="ar-drift ar-drift--deep"><img src={photos.mano} alt="" aria-hidden="true" /></Parallax>
        <Reveal className="ar-stack__card"><p className="ar-kicker">{copy.home_19}</p><p className="ar-stack__line">{copy.home_20}</p></Reveal>
      </section>

      <section id="regalos" className="ar-gift" aria-labelledby="ar-gift-title">
        <Reveal className="ar-gift__copy">
          <p className="ar-kicker">{copy.home_21}</p>
          <h2 id="ar-gift-title" className="ar-title">{copy.home_22}</h2>
          <p>{copy.home_23}</p>
          <a className="ar-btn ar-btn--line" href="#joyas">{copy.home_24}</a>
        </Reveal>
        <div className="ar-gift__photo"><Parallax strength={60} className="ar-drift"><img src={photos.caja} alt={copy.home_25} /></Parallax></div>
      </section>

      <section id="ayuda" className="ar-faq" aria-labelledby="ar-faq-title">
        <Reveal><h2 id="ar-faq-title" className="ar-title">{copy.home_26}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
