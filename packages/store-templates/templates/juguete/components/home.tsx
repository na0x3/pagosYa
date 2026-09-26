import Shell from './Shell';
import { store, photos } from './store-data';

const ages = ['0 a 2 años', '3 a 5 años', '6 a 8 años', '9 años o más'];
const values = [
  { title: 'Imaginar', body: 'Juguetes que dejan espacio para inventar.', color: 'red' },
  { title: 'Moverse', body: 'Para correr, trepar, construir y derribar.', color: 'blue' },
  { title: 'Compartir', body: 'Juegos para jugar en familia o con amigos.', color: 'green' },
];
const faqs = [
  { q: '¿Para qué edad es cada juguete?', a: 'Cada ficha indica la edad recomendada. Si dudas, escríbenos y te ayudamos a elegir.' },
  { q: '¿Lo envuelven para regalo?', a: 'Sí. Déjanos una nota en tu pedido y lo enviamos listo para regalar.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="ju-hero">
        <span className="ju-blob ju-blob--red" aria-hidden="true" /><span className="ju-blob ju-blob--blue" aria-hidden="true" /><span className="ju-blob ju-blob--green" aria-hidden="true" />
        <div className="ju-hero__copy">
          <h1 className="ju-display">Jugar es la mejor forma de aprender</h1>
          <p className="ju-lead">Juguetes elegidos para imaginar, moverse y compartir.</p>
          <a className="ju-btn" href="#juguetes">Ver juguetes</a>
        </div>
        <div className="ju-hero__photo"><img src={photos.hero} alt={`Juguetes de ${store.name}`} /></div>
      </section>

      <section id="edades" className="ju-ages" aria-labelledby="ju-ages-title">
        <h2 id="ju-ages-title" className="ju-small">Encuentra por edad</h2>
        <ul>{ages.map(age => <li key={age}><a href="#juguetes">{age}</a></li>)}</ul>
      </section>

      <section id="juguetes" className="ju-shop" aria-labelledby="ju-shop-title">
        <h2 id="ju-shop-title" className="ju-title">Juguetes</h2>
        <template data-pagosya-product-template>
          <article className="ju-card">
            <a className="ju-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="ju-card__name" data-product-field="name">Juguete</h3>
            <p className="ju-card__price" data-product-field="price" />
            <button type="button" className="ju-card__add" data-product-add>¡Lo quiero!</button>
          </article>
        </template>
        <div className="ju-grid" data-pagosya-catalog />
      </section>

      <section className="ju-values" aria-labelledby="ju-values-title">
        <img src={photos.juego} alt="Niños jugando" />
        <div>
          <h2 id="ju-values-title" className="ju-title ju-title--left">Lo que buscamos en cada juguete</h2>
          <ul>{values.map(item => <li key={item.title} className={`ju-values__${item.color}`}><h3>{item.title}</h3><p>{item.body}</p></li>)}</ul>
        </div>
      </section>

      <section id="preguntas" className="ju-faq" aria-labelledby="ju-faq-title">
        <h2 id="ju-faq-title" className="ju-title">Preguntas</h2>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
