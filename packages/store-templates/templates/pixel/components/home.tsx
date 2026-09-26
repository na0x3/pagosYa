import Shell from './Shell';
import { store, photos } from './store-data';

const bento = [
  { title: 'Originales', body: 'Productos nuevos, sellados y con su caja.', size: 'wide' },
  { title: 'Te asesoramos', body: 'Escríbenos antes de comprar y te ayudamos a elegir.', size: '' },
  { title: 'Paga como quieras', body: 'QR de cualquier banco o tarjeta.', size: '' },
  { title: 'Envío seguro', body: 'Bien embalado y con seguimiento hasta tu puerta.', size: 'wide' },
];
const faqs = [
  { q: '¿Los productos tienen garantía?', a: 'Cada producto indica su garantía en la ficha. Si algo falla, escríbenos y lo resolvemos.' },
  { q: '¿Cuánto tarda el envío?', a: 'Despachamos en 24 a 48 horas hábiles. Te avisamos cuando sale tu pedido.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="px-hero">
        <div className="px-glow" aria-hidden="true" />
        <p className="px-pill">Lo nuevo ya está aquí</p>
        <h1 className="px-display">La tecnología que <span>querías</span>, al alcance de un clic.</h1>
        <p className="px-lead">Equipos y accesorios elegidos con cuidado, listos para enviar.</p>
        <div className="px-actions"><a className="px-btn" href="#productos">Ver productos</a><a className="px-btn px-btn--ghost" href="#por-que">Por qué comprar aquí</a></div>
        <img className="px-hero__device" src={photos.hero} alt={`Producto destacado de ${store.name}`} />
      </section>

      <section id="productos" className="px-shop" aria-labelledby="px-shop-title">
        <h2 id="px-shop-title" className="px-title">Productos</h2>
        <template data-pagosya-product-template>
          <article className="px-card">
            <a className="px-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="px-card__name" data-product-field="name">Producto</h3>
            <p className="px-card__desc" data-product-field="description" />
            <div className="px-card__row"><span className="px-card__price" data-product-field="price" /><button type="button" className="px-card__add" data-product-add>Agregar</button></div>
          </article>
        </template>
        <div className="px-grid" data-pagosya-catalog />
      </section>

      <section id="por-que" className="px-bento" aria-labelledby="px-bento-title">
        <h2 id="px-bento-title" className="px-title">Por qué comprar aquí</h2>
        <ul>{bento.map(item => <li key={item.title} className={item.size ? `px-bento__${item.size}` : undefined}><h3>{item.title}</h3><p>{item.body}</p></li>)}
          <li className="px-bento__photo"><img src={photos.detalle} alt="Detalle de un producto" /></li>
        </ul>
      </section>

      <section id="preguntas" className="px-faq" aria-labelledby="px-faq-title">
        <h2 id="px-faq-title" className="px-title">Soporte</h2>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
