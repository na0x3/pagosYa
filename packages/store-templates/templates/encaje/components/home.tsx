import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const faqs = [
  { q: '¿Cómo sé mi talle?', a: 'Cada prenda tiene su tabla de medidas. Si dudas, escríbenos y te ayudamos.' },
  { q: '¿Puedo cambiar una prenda?', a: 'Sí, dentro de los 15 días, sin uso y con su etiqueta.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta, desde tu celular.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="en-hero">
        <div className="en-hero__copy">
          <p className="en-kicker">Nueva colección</p>
          <h1 className="en-display">Romance<br /><em>de otra época</em></h1>
          <p className="en-ornament" aria-hidden="true">— ✿ —</p>
          <p className="en-lead">Vestidos, encajes y detalles que se sienten como una tarde de jardín.</p>
          <a className="en-btn" href="#novedades">Descubrir la colección</a>
        </div>
        <div className="en-hero__arch"><Parallax strength={70} mobileStrength={30} className="en-drift"><img src={photos.hero} alt={`Vestido de ${store.name} en un jardín`} /></Parallax></div>
      </section>

      <section id="novedades" className="en-shop" aria-labelledby="en-shop-title">
        <Reveal className="en-shop__head"><p className="en-kicker">Recién llegado</p><h2 id="en-shop-title" className="en-title">Novedades</h2></Reveal>
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

      <section className="en-lace" aria-label="Detalles">
        <Parallax strength={110} className="en-drift en-drift--deep"><img src={photos.detalle} alt="" aria-hidden="true" /></Parallax>
        <Reveal><p className="en-lace__line">Encajes, perlas<br /><em>y detalles hechos a mano.</em></p></Reveal>
      </section>

      <section id="coleccion" className="en-garden" aria-labelledby="en-garden-title">
        <div className="en-garden__photo"><Parallax strength={60} className="en-drift"><img src={photos.jardin} alt="Mesa de té en el jardín" /></Parallax></div>
        <Reveal className="en-garden__copy" delay={100}>
          <p className="en-kicker">La colección</p>
          <h2 id="en-garden-title" className="en-title">Una tarde en el jardín</h2>
          <p>Telas livianas, tonos empolvados y siluetas que se mueven contigo. Para días de sol y ocasiones especiales.</p>
          <a className="en-btn en-btn--line" href="#novedades">Ver la colección</a>
        </Reveal>
      </section>

      <section id="preguntas" className="en-faq" aria-labelledby="en-faq-title">
        <Reveal><h2 id="en-faq-title" className="en-title">Preguntas</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
