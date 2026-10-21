import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const band = [copy.home_1, store.name, copy.home_2, copy.home_3];
const chips = [copy.home_4, copy.home_5, copy.home_6];
const faqs = [
  { q: copy.home_7, a: copy.home_8 },
  { q: copy.home_9, a: copy.home_10 },
  { q: copy.home_11, a: copy.home_12 },
];

function Wave({ from, to }: { from: string; to: string }) {
  return <svg className="cr-wave" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" style={{ background: from }}>
    <path d="M0 30 C120 0 240 60 360 30 C480 0 600 60 720 30 C840 0 960 60 1080 30 C1200 0 1320 60 1440 30 V60 H0 Z" fill={to} stroke="#111" strokeWidth="3" vectorEffect="non-scaling-stroke" />
  </svg>;
}

export default function Home() {
  const ticker = [...band, ...band, ...band, ...band];
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="cr-hero">
        <span className="cr-blob cr-blob--a" aria-hidden="true" /><span className="cr-blob cr-blob--b" aria-hidden="true" />
        <div className="cr-hero__copy">
          <h1 className="cr-display">{copy.home_13}</h1>
          <p className="cr-lead">{copy.home_14}</p>
          <a className="cr-btn" href="#productos">{copy.home_15}</a>
        </div>
        <Parallax strength={50} mobileStrength={20} className="cr-hero__float"><div className="cr-hero__card"><img src={photos.hero} alt={`Producto de ${store.name}`} /><span className="cr-sticker" aria-hidden="true">{copy.home_16}</span></div></Parallax>
      </section>
      <div id="cinta" className="cr-band" aria-hidden="true"><div className="cr-band__track">{ticker.map((text, index) => <span key={index}>{text} •</span>)}</div></div>

      <section id="productos" className="cr-shop" aria-labelledby="cr-shop-title">
        <Reveal><h2 id="cr-shop-title" className="cr-title">{copy.home_17}</h2></Reveal>
        <template data-pagosya-product-template>
          <article className="cr-card">
            <a className="cr-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="cr-card__body">
              <h3 className="cr-card__name" data-product-field="name">Producto</h3>
              <p className="cr-card__price" data-product-field="price" />
              <button type="button" className="cr-card__add" data-product-add>Lo quiero</button>
            </div>
          </article>
        </template>
        <div className="cr-grid" data-pagosya-catalog />
      </section>

      <Wave from="#fff" to="#6045d8" />
      <section id="compartir" className="cr-feature" aria-labelledby="cr-feature-title">
        <Reveal>
          <h2 id="cr-feature-title" className="cr-title cr-title--light">{copy.home_18}</h2>
          <p>{copy.home_19}</p>
          <ul className="cr-chips">{chips.map(chip => <li key={chip}>{chip}</li>)}</ul>
        </Reveal>
        <Reveal delay={120}><img className="cr-feature__photo" src={photos.feature} alt={copy.home_20} /></Reveal>
      </section>
      <Wave from="#6045d8" to="#ffb6d9" />

      <section id="frase" className="cr-statement" aria-label="Frase de la marca">
        <p className="cr-statement__line">{copy.home_21}</p>
        <Parallax strength={-80} className="cr-statement__float"><img className="cr-statement__product" src={photos.statement} alt="" aria-hidden="true" /></Parallax>
        <p className="cr-statement__line cr-statement__line--outline">{copy.home_22}</p>
        <p className="cr-statement__line">migas</p>
      </section>

      <div id="clientes" className="cr-strip" aria-label="Nuestros clientes"><img src={photos.gente1} alt={copy.home_23} /><img src={photos.gente2} alt={copy.home_24} /><img src={photos.gente3} alt={copy.home_25} /></div>

      <section id="preguntas" className="cr-faq" aria-labelledby="cr-faq-title">
        <Reveal><h2 id="cr-faq-title" className="cr-title">{copy.home_26}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>

      <section id="pedido" className="cr-cta" aria-labelledby="cr-cta-title">
        <Reveal><h2 id="cr-cta-title" className="cr-cta__title">{copy.home_27}</h2></Reveal>
        <a className="cr-btn cr-btn--big" href="#productos">{copy.home_28}</a>
      </section>
    </main>
  </Shell>;
}
