import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const faqs = [
  { q: '¿Me ayudan a elegir un libro?', a: 'Sí. Cuéntanos qué te gustó leer últimamente y te recomendamos el siguiente.' },
  { q: '¿Lo envuelven para regalo?', a: 'Con gusto. Déjanos una nota en tu pedido y lo enviamos listo para regalar.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="pg-hero">
        <Parallax strength={120} mobileStrength={40} className="pg-drift pg-drift--deep"><img src={photos.hero} alt={`Interior de ${store.name}`} /></Parallax>
        <div className="pg-hero__card">
          <p className="pg-kicker">Librería</p>
          <h1 className="pg-display">Un buen libro te está esperando</h1>
          <p className="pg-lead">Novedades, clásicos y los libros que la casa recomienda. Elige el tuyo y lo llevamos a tu puerta.</p>
          <a className="pg-btn" href="#libros">Ver los libros</a>
        </div>
      </section>

      <section id="libros" className="pg-shop" aria-labelledby="pg-shop-title">
        <Reveal className="pg-shop__head"><h2 id="pg-shop-title" className="pg-title">Recomendados de la semana</h2><p>Leídos y elegidos por nosotros.</p></Reveal>
        <template data-pagosya-product-template>
          <article className="pg-book">
            <a className="pg-book__cover" data-product-link href="product.html"><img data-product-field="image" alt="Portada del libro" /><span className="pg-book__note">Nos encantó</span></a>
            <h3 className="pg-book__title" data-product-field="name">Libro</h3>
            <p className="pg-book__desc" data-product-field="description" />
            <div className="pg-book__row"><span className="pg-book__price" data-product-field="price" /><button type="button" className="pg-book__add" data-product-add>Agregar</button></div>
          </article>
        </template>
        <div className="pg-grid" data-pagosya-catalog />
      </section>

      <blockquote className="pg-quote"><Reveal><p>Hay libros que se leen de un tirón y otros que se quedan contigo para siempre.</p></Reveal></blockquote>

      <section id="en-casa" className="pg-home" aria-labelledby="pg-home-title">
        <Reveal><img src={photos.lectura} alt="Un libro y una taza en la cama" /></Reveal>
        <Reveal delay={120}>
          <h2 id="pg-home-title" className="pg-title">Para leer en casa</h2>
          <p>Te lo enviamos bien protegido, y si es un regalo, envuelto y con tu nota. Solo falta el café.</p>
          <a className="pg-link" href="#libros">Elegir mi próxima lectura →</a>
        </Reveal>
      </section>

      <section id="libreria" className="pg-store" aria-labelledby="pg-store-title">
        <Reveal><h2 id="pg-store-title" className="pg-title pg-center">La librería</h2></Reveal>
        <div className="pg-mosaic">
          <Parallax strength={40}><img src={photos.local1} alt="Una lectora eligiendo un libro" /></Parallax>
          <Parallax strength={-50}><img src={photos.local2} alt="Estantes llenos de libros" /></Parallax>
          <Parallax strength={70}><img src={photos.pila} alt="Una pila de libros" /></Parallax>
        </div>
      </section>

      <section id="preguntas" className="pg-faq" aria-labelledby="pg-faq-title">
        <Reveal><h2 id="pg-faq-title" className="pg-title">Preguntas</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
