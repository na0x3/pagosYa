import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const care = [
  { title: 'Guárdalas por separado', body: 'Cada pieza en su bolsita, lejos de la humedad.' },
  { title: 'Póntelas al final', body: 'Después del perfume y las cremas, nunca antes.' },
  { title: 'Límpialas con suavidad', body: 'Un paño seco y suave les devuelve el brillo.' },
];
const faqs = [
  { q: '¿Viene lista para regalar?', a: 'Sí. Cada pedido sale en su estuche, con una nota si nos la dejas.' },
  { q: '¿Puedo cambiarla?', a: 'Escríbenos dentro de los 7 días de recibida y lo coordinamos.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="br-hero">
        <p className="br-kicker">Colección</p>
        <h1 className="br-display">Detalles que se quedan contigo</h1>
        <div className="br-rule" aria-hidden="true"><span>◆</span></div>
        <div className="br-hero__arch"><Parallax strength={60} mobileStrength={30} className="br-drift"><img src={photos.hero} alt={`Joyas de ${store.name}`} /></Parallax></div>
        <a className="br-btn" href="#coleccion">Descubrir la colección</a>
      </section>

      <section id="coleccion" className="br-shop" aria-labelledby="br-shop-title">
        <Reveal><h2 id="br-shop-title" className="br-title">La colección</h2></Reveal>
        <template data-pagosya-product-template>
          <article className="br-card">
            <a className="br-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="br-card__name" data-product-field="name">Pieza</h3>
            <p className="br-card__price" data-product-field="price" />
            <button type="button" className="br-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="br-grid" data-pagosya-catalog />
      </section>

      <section id="cuidados" className="br-care" aria-labelledby="br-care-title">
        <Reveal><img src={photos.detalle} alt="Detalle de una joya" /></Reveal>
        <Reveal delay={120}>
          <h2 id="br-care-title" className="br-title br-title--left">Para que brillen siempre</h2>
          <ul>{care.map(item => <li key={item.title}><h3>{item.title}</h3><p>{item.body}</p></li>)}</ul>
        </Reveal>
      </section>

      <section id="regalos" className="br-gift" aria-labelledby="br-gift-title">
        <Reveal className="br-gift__copy">
          <p className="br-kicker br-kicker--light">Regalos</p>
          <h2 id="br-gift-title" className="br-title br-title--light">Un regalo que se recuerda</h2>
          <p>Elige la pieza, déjanos tu nota y la enviamos lista para entregar.</p>
          <a className="br-btn br-btn--light" href="#coleccion">Elegir un regalo</a>
        </Reveal>
        <div className="br-gift__media"><Parallax strength={90} className="br-drift br-drift--deep"><img src={photos.regalo} alt="Estuche de regalo" /></Parallax></div>
      </section>

      <section id="preguntas" className="br-faq" aria-labelledby="br-faq-title">
        <Reveal><h2 id="br-faq-title" className="br-title">Preguntas</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
