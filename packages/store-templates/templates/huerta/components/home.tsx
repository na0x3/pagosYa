import Shell from './Shell';
import { store, photos } from './store-data';

const chips = ['Frutas', 'Verduras', 'Hierbas', 'Granos', 'Lácteos', 'Miel'];
const route = [
  { title: 'Siembra', body: 'Trabajamos con productores que cuidan la tierra.' },
  { title: 'Cosecha', body: 'Se recoge en su punto, no antes.' },
  { title: 'Entrega', body: 'Llega a tu casa en pocos días, todavía fresco.' },
];
const faqs = [
  { q: '¿Qué día llega mi pedido?', a: 'Armamos y enviamos los pedidos en los días de reparto de tu zona. Te avisamos antes.' },
  { q: '¿Qué pasa si algo no está en temporada?', a: 'Te avisamos y te proponemos un reemplazo o el reembolso de ese producto.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="hu-hero">
        <img className="hu-hero__photo" src={photos.hero} alt={`Productos frescos de ${store.name}`} />
        <div className="hu-hero__copy">
          <p className="hu-tag">De temporada</p>
          <h1 className="hu-display">Fresco, cerca y de verdad</h1>
          <p className="hu-lead">Lo que da la tierra esta semana, directo de quienes lo cultivan.</p>
          <div className="hu-actions"><a className="hu-btn" href="#productos">Hacer mi pedido</a><a className="hu-link" href="#canasta">Ver la canasta semanal</a></div>
          <ul className="hu-chips" aria-label="Lo que encontrarás">{chips.map(chip => <li key={chip}>{chip}</li>)}</ul>
        </div>
      </section>

      <section id="productos" className="hu-shop" aria-labelledby="hu-shop-title">
        <div className="hu-shop__head"><h2 id="hu-shop-title" className="hu-title">Esta semana</h2><p>Precios por unidad o por peso, según cada producto.</p></div>
        <template data-pagosya-product-template>
          <article className="hu-card">
            <a className="hu-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="hu-card__body">
              <h3 className="hu-card__name" data-product-field="name">Producto</h3>
              <p className="hu-card__desc" data-product-field="description" />
              <div className="hu-card__row"><span className="hu-card__price" data-product-field="price" /><button type="button" className="hu-card__add" data-product-add>Agregar</button></div>
            </div>
          </article>
        </template>
        <div className="hu-grid" data-pagosya-catalog />
      </section>

      <section id="origen" className="hu-route" aria-labelledby="hu-route-title">
        <img src={photos.campo} alt="El campo donde crece lo que vendemos" />
        <div>
          <h2 id="hu-route-title" className="hu-title">De dónde viene</h2>
          <ol>{route.map((step, index) => <li key={step.title}><span className="hu-route__dot">{index + 1}</span><h3>{step.title}</h3><p>{step.body}</p></li>)}</ol>
        </div>
      </section>

      <section id="canasta" className="hu-box" aria-labelledby="hu-box-title">
        <div>
          <p className="hu-tag hu-tag--light">Canasta semanal</p>
          <h2 id="hu-box-title" className="hu-title hu-title--light">Una canasta, toda la semana resuelta</h2>
          <p>Frutas y verduras de temporada, armadas por nosotros. Pídela cuando quieras.</p>
          <a className="hu-btn hu-btn--light" href="#productos">Armar mi pedido</a>
        </div>
        <img src={photos.canasta} alt="Canasta con productos de temporada" />
      </section>

      <section id="preguntas" className="hu-faq" aria-labelledby="hu-faq-title">
        <h2 id="hu-faq-title" className="hu-title">Preguntas</h2>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
