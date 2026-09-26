import Shell, { Paw } from './Shell';
import { store, photos } from './store-data';

const tips = [
  { title: 'Cambia de comida de a poco', body: 'Mezcla la nueva con la de siempre durante una semana.' },
  { title: 'Juego todos los días', body: 'Unos minutos de juego valen más que un juguete nuevo.' },
  { title: 'Agua fresca siempre', body: 'Cámbiala cada día y lava el plato seguido.' },
];
const faqs = [
  { q: '¿Qué tamaño elijo?', a: 'Cada producto indica para qué tamaño o edad es. Si dudas, escríbenos y te ayudamos.' },
  { q: '¿Cuándo llega mi pedido?', a: 'Lo preparamos en 24 horas y te avisamos cuando sale.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="hl-hero">
        <div className="hl-hero__copy">
          <h1 className="hl-display">Todo para que mueva la cola</h1>
          <p className="hl-lead">Comida, juguetes y accesorios elegidos por gente que también vive con mascotas.</p>
          <a className="hl-btn" href="#productos">Comprar ahora</a>
        </div>
        <div className="hl-hero__media">
          <img src={photos.hero} alt={`Productos de ${store.name}`} />
          <Paw className="hl-paw hl-paw--a" /><Paw className="hl-paw hl-paw--b" /><Paw className="hl-paw hl-paw--c" />
        </div>
      </section>

      <section id="tipos" className="hl-types" aria-label="Compra por mascota">
        <a href="#productos" className="hl-type hl-type--dog"><img src={photos.perros} alt="Para perros" /><span>Para perros</span></a>
        <a href="#productos" className="hl-type hl-type--cat"><img src={photos.gatos} alt="Para gatos" /><span>Para gatos</span></a>
      </section>

      <section id="productos" className="hl-shop" aria-labelledby="hl-shop-title">
        <h2 id="hl-shop-title" className="hl-title">Sus favoritos</h2>
        <template data-pagosya-product-template>
          <article className="hl-card">
            <a className="hl-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="hl-card__name" data-product-field="name">Producto</h3>
            <p className="hl-card__desc" data-product-field="description" />
            <div className="hl-card__row"><span className="hl-card__price" data-product-field="price" /><button type="button" className="hl-card__add" data-product-add>Agregar</button></div>
          </article>
        </template>
        <div className="hl-grid" data-pagosya-catalog />
      </section>

      <section id="consejos" className="hl-tips" aria-labelledby="hl-tips-title">
        <h2 id="hl-tips-title" className="hl-title hl-title--light">Consejos de la casa</h2>
        <ul>{tips.map(tip => <li key={tip.title}><Paw className="hl-tips__paw" /><h3>{tip.title}</h3><p>{tip.body}</p></li>)}</ul>
      </section>

      <section id="preguntas" className="hl-faq" aria-labelledby="hl-faq-title">
        <h2 id="hl-faq-title" className="hl-title">Preguntas</h2>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
