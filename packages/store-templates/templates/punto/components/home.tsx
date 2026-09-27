import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const specs = [
  { k: '01', t: 'Diseño transparente', b: 'Mostramos cómo está hecho. Nada que esconder.' },
  { k: '02', t: 'Carga rápida', b: 'USB-C en todo. Un cable para todo lo que llevas.' },
  { k: '03', t: 'Garantía real', b: 'Un año de garantía y soporte que responde.' },
];
const faqs = [
  { q: '¿Tiene garantía?', a: 'Sí, un año contra fallas de fábrica. Escríbenos y lo resolvemos.' },
  { q: '¿Cuánto tarda el envío?', a: 'Despachamos en 24 horas y te avisamos cuando sale tu pedido.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta, desde tu celular.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="pt-hero">
        <div className="pt-hero__copy">
          <p className="pt-mono pt-kicker"><span className="pt-red" aria-hidden="true">●</span> Nuevo</p>
          <h1 className="pt-display">Tecnología,<br />sin ruido.</h1>
          <p className="pt-lead">Objetos simples, honestos y bien hechos. Lo que necesitas, nada más.</p>
          <a className="pt-btn" href="#productos">Ver productos</a>
        </div>
        <div className="pt-hero__stage">
          <Parallax strength={70} mobileStrength={30} className="pt-hero__float"><img src={photos.hero} alt={`Producto destacado de ${store.name}`} /></Parallax>
          <p className="pt-mono pt-tag pt-tag--a" aria-hidden="true">[ carga ]</p>
          <p className="pt-mono pt-tag pt-tag--b" aria-hidden="true">[ 30 h ]</p>
        </div>
      </section>

      <section id="productos" className="pt-shop" aria-labelledby="pt-shop-title">
        <Reveal className="pt-shop__head"><h2 id="pt-shop-title" className="pt-title">Productos</h2><p className="pt-mono">Todo disponible · envío 24 h</p></Reveal>
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
        <div className="pt-detail__photo"><Parallax strength={110} className="pt-drift pt-drift--deep"><img src={photos.detalle} alt="Detalle del interior de un producto" /></Parallax></div>
        <Reveal className="pt-detail__copy">
          <p className="pt-mono pt-kicker">Diseño</p>
          <h2 id="pt-detail-title" className="pt-title pt-title--light">Hecho para verse por dentro.</h2>
          <ol className="pt-specs">{specs.map(spec => <li key={spec.k}><span className="pt-mono">{spec.k}</span><div><h3>{spec.t}</h3><p>{spec.b}</p></div></li>)}</ol>
        </Reveal>
      </section>

      <section id="calle" className="pt-street" aria-label="En la calle">
        <Parallax strength={140} className="pt-drift pt-drift--deep"><img src={photos.calle} alt="" aria-hidden="true" /></Parallax>
        <Reveal><p className="pt-street__line">Menos cosas.<br />Mejores cosas.</p></Reveal>
      </section>

      <section id="ayuda" className="pt-faq" aria-labelledby="pt-faq-title">
        <Reveal><h2 id="pt-faq-title" className="pt-title">Ayuda</h2></Reveal>
        <div>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
