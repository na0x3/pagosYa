import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const steps = [
  { title: 'Limpia', body: 'Empieza con la piel limpia para que lo demás funcione mejor.' },
  { title: 'Trata', body: 'Aplica lo que tu piel necesita hoy, en capas finas.' },
  { title: 'Hidrata', body: 'Sella la rutina y deja que actúe mientras sigues tu día.' },
];
const questions = [
  { q: '¿Cuánto tarda el envío?', a: 'Preparamos tu pedido en 24 horas y te avisamos cuando sale.' },
  { q: '¿Cómo puedo pagar?', a: 'Con QR de cualquier banco o con tarjeta, desde tu celular.' },
  { q: '¿Puedo cambiar un producto?', a: 'Escríbenos dentro de los 7 días de recibido y lo resolvemos.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="au-hero">
        <div className="au-hero__media"><Parallax strength={60} mobileStrength={30} className="au-drift"><img src={photos.hero} alt={`Productos de ${store.name}`} /></Parallax></div>
        <div className="au-hero__copy">
          <p className="au-eyebrow">Nueva temporada</p>
          <h1 className="au-display">Tu piel, en su mejor versión.</h1>
          <p className="au-lead">Pocos pasos, fórmulas pensadas para el día a día y una rutina que sí vas a mantener.</p>
          <div className="au-actions"><a className="au-btn" href="#tienda">Ver productos</a><a className="au-link" href="#rutina">Cómo usarlos</a></div>
        </div>
      </section>

      <section id="tienda" className="au-shop" aria-labelledby="au-shop-title">
        <Reveal className="au-shop__head">
          <p className="au-eyebrow">Tienda</p>
          <h2 id="au-shop-title" className="au-title">Los esenciales</h2>
          <p className="au-muted">Todo lo que ofrecemos, listo para agregar a tu bolsa.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="au-card">
            <a className="au-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="au-card__body">
              <h3 className="au-card__name" data-product-field="name">Producto</h3>
              <p className="au-card__desc" data-product-field="description" />
              <div className="au-card__row"><span className="au-card__price" data-product-field="price" /><button type="button" className="au-card__add" data-product-add>Agregar</button></div>
            </div>
          </article>
        </template>
        <div className="au-grid" data-pagosya-catalog />
      </section>

      <section id="rutina" className="au-ritual" aria-labelledby="au-ritual-title">
        <Reveal><img className="au-ritual__photo" src={photos.ritual} alt="Rutina de cuidado" /></Reveal>
        <Reveal className="au-ritual__copy" delay={120}>
          <p className="au-eyebrow">Rutina</p>
          <h2 id="au-ritual-title" className="au-title">Tres pasos, cada día</h2>
          <ol className="au-steps">{steps.map((step, index) => <li key={step.title}><span className="au-steps__n">{index + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        </Reveal>
      </section>

      <section className="au-texture" aria-label="Textura">
        <Parallax strength={90} className="au-drift au-drift--deep"><img src={photos.texture} alt="" aria-hidden="true" /></Parallax>
        <Reveal><p className="au-statement">Texturas ligeras que se sienten bien desde la primera vez.</p></Reveal>
      </section>

      <section id="preguntas" className="au-faq" aria-labelledby="au-faq-title">
        <Reveal><h2 id="au-faq-title" className="au-title">Preguntas frecuentes</h2></Reveal>
        {questions.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
