import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const band = ['Crujiente de verdad', store.name, 'Hecho en pequeñas tandas', 'Pide el tuyo'];
const chips = ['Sabor intenso', 'Ingredientes reales', 'Para compartir'];
const faqs = [
  { q: '¿Cuándo llega mi pedido?', a: 'Lo preparamos en 24 a 48 horas y te avisamos cuando sale.' },
  { q: '¿Hacen pedidos grandes?', a: 'Sí, escríbenos para eventos, oficinas o regalos corporativos.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
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
          <h1 className="cr-display">El antojo que estabas buscando.</h1>
          <p className="cr-lead">Recién hecho, con ingredientes reales y un crujido que se escucha. Pide y compártelo (o no).</p>
          <a className="cr-btn" href="#productos">Pedir ahora</a>
        </div>
        <Parallax strength={50} mobileStrength={20} className="cr-hero__float"><div className="cr-hero__card"><img src={photos.hero} alt={`Producto de ${store.name}`} /><span className="cr-sticker" aria-hidden="true">¡Nuevo!</span></div></Parallax>
      </section>
      <div id="cinta" className="cr-band" aria-hidden="true"><div className="cr-band__track">{ticker.map((text, index) => <span key={index}>{text} •</span>)}</div></div>

      <section id="productos" className="cr-shop" aria-labelledby="cr-shop-title">
        <Reveal><h2 id="cr-shop-title" className="cr-title">Elige tu sabor</h2></Reveal>
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
          <h2 id="cr-feature-title" className="cr-title cr-title--light">Hecho para compartir</h2>
          <p>Una bolsa, varias manos. Pide para la oficina, la casa o el camino.</p>
          <ul className="cr-chips">{chips.map(chip => <li key={chip}>{chip}</li>)}</ul>
        </Reveal>
        <Reveal delay={120}><img className="cr-feature__photo" src={photos.feature} alt="Nuestro producto servido" /></Reveal>
      </section>
      <Wave from="#6045d8" to="#ffb6d9" />

      <section id="frase" className="cr-statement" aria-label="Frase de la marca">
        <p className="cr-statement__line">No dejes</p>
        <Parallax strength={-80} className="cr-statement__float"><img className="cr-statement__product" src={photos.statement} alt="" aria-hidden="true" /></Parallax>
        <p className="cr-statement__line cr-statement__line--outline">ni las</p>
        <p className="cr-statement__line">migas</p>
      </section>

      <div id="clientes" className="cr-strip" aria-label="Nuestros clientes"><img src={photos.gente1} alt="Compartiendo nuestros productos" /><img src={photos.gente2} alt="Un plato con nuestros productos" /><img src={photos.gente3} alt="Un momento con nuestros productos" /></div>

      <section id="preguntas" className="cr-faq" aria-labelledby="cr-faq-title">
        <Reveal><h2 id="cr-faq-title" className="cr-title">Preguntas</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>

      <section id="pedido" className="cr-cta" aria-labelledby="cr-cta-title">
        <Reveal><h2 id="cr-cta-title" className="cr-cta__title">¿Qué esperas?</h2></Reveal>
        <a className="cr-btn cr-btn--big" href="#productos">Pedir el mío</a>
      </section>
    </main>
  </Shell>;
}
