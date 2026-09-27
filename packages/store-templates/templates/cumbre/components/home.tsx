import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const uses = [
  { title: 'Para todos los días', body: 'Ciudad, trabajo, universidad.', photo: 'uso1' },
  { title: 'Para el fin de semana', body: 'Cerro, lago o carretera.', photo: 'uso2' },
  { title: 'Para regalar', body: 'Algo que se usa de verdad.', photo: 'uso3' },
];
const faqs = [
  { q: '¿Cuánto tarda el envío?', a: 'Despachamos en 24 a 48 horas hábiles y te avisamos cuando sale tu pedido.' },
  { q: '¿Puedo cambiar la talla o el modelo?', a: 'Sí. Escríbenos dentro de los 7 días de recibido y coordinamos el cambio.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="cu-hero">
        <Parallax strength={120} mobileStrength={50} className="cu-drift"><img src={photos.hero} alt={`Equipo de ${store.name} en la montaña`} /></Parallax>
        <div className="cu-hero__copy">
          <p className="cu-kicker">Temporada nueva</p>
          <h1 className="cu-display">Hecho para salir.</h1>
          <a className="cu-btn" href="#novedades">Comprar ahora</a>
        </div>
      </section>

      <section id="novedades" className="cu-shop" aria-labelledby="cu-new">
        <Reveal className="cu-shop__head"><h2 id="cu-new" className="cu-title">Novedades de temporada</h2><a href="#coleccion" className="cu-more">Ver todo</a></Reveal>
        <template data-pagosya-product-template>
          <article className="cu-card">
            <a className="cu-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /><span className="cu-card__tag">Edición limitada</span></a>
            <h3 className="cu-card__name" data-product-field="name">Producto</h3>
            <p className="cu-card__desc" data-product-field="description" />
            <p className="cu-card__price" data-product-field="price" />
            <button type="button" className="cu-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="cu-grid" data-pagosya-catalog />
      </section>

      <section id="coleccion" className="cu-banner" aria-labelledby="cu-banner-title">
        <Parallax strength={160} className="cu-drift cu-drift--deep"><img src={photos.banner} alt="" aria-hidden="true" /></Parallax>
        <Reveal className="cu-banner__copy">
          <h2 id="cu-banner-title" className="cu-banner__title">Lo que llevas, te acompaña.</h2>
          <a className="cu-btn" href="#novedades">Ver la colección</a>
        </Reveal>
      </section>

      <section id="usos" className="cu-uses" aria-labelledby="cu-uses-title">
        <Reveal><h2 id="cu-uses-title" className="cu-title cu-center">Para cada salida</h2></Reveal>
        <ul>{uses.map(use => <li key={use.title}><a href="#novedades"><img src={photos[use.photo]} alt={use.title} /><h3>{use.title}</h3><p>{use.body}</p></a></li>)}</ul>
      </section>

      <section id="preguntas" className="cu-faq" aria-labelledby="cu-faq-title">
        <Reveal><h2 id="cu-faq-title" className="cu-title">Preguntas frecuentes</h2></Reveal>
        <div>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
