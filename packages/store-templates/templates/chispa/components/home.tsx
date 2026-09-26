import Shell from './Shell';
import { store, photos } from './store-data';

const tiles = [
  { label: 'Lo nuevo', photo: 'p1', tone: 'blue' },
  { label: 'Favoritos', photo: 'p2', tone: 'green' },
  { label: 'Para regalar', photo: 'p3', tone: 'pink' },
];
const promises = [
  { title: 'Pagas como quieras', body: 'QR de cualquier banco o tarjeta, desde tu celular.' },
  { title: 'Sabes dónde está tu pedido', body: 'Te avisamos cuando lo preparamos y cuando sale.' },
  { title: 'Te respondemos', body: '¿Dudas? Escríbenos y te ayudamos a elegir.' },
];
const faqs = [
  { q: '¿Cuánto tarda mi pedido?', a: 'Lo preparamos en 24 a 48 horas y te avisamos cuando sale.' },
  { q: '¿Puedo regalarlo?', a: 'Claro. Déjanos una nota en tu pedido y lo enviamos listo para regalar.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="ch-hero">
        <div className="ch-hero__panel">
          <h1 className="ch-display">Pequeñas cosas que te cambian el día.</h1>
          <p className="ch-lead">Colores que se notan, calidad que dura. Descubre lo que tenemos para ti.</p>
          <a className="ch-btn ch-btn--lime" href="#productos">Comprar ahora</a>
        </div>
        <div className="ch-hero__media">
          <svg className="ch-hero__wave" viewBox="0 0 80 800" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0 H40 C80 100 0 200 40 300 C80 400 0 500 40 600 C80 700 0 750 40 800 H0 Z" /></svg>
          <img src={photos.hero} alt={`Productos de ${store.name}`} />
        </div>
      </section>

      <section className="ch-cats" aria-labelledby="ch-cats-title">
        <h2 id="ch-cats-title" className="ch-title ch-center">Explora</h2>
        <ul className="ch-tiles">{tiles.map(tile => <li key={tile.label}><a href="#productos" className={`ch-tile ch-tile--${tile.tone}`}><img src={photos[tile.photo]} alt={tile.label} /><span>{tile.label}</span></a></li>)}</ul>
      </section>

      <section id="productos" className="ch-shop" aria-labelledby="ch-shop-title">
        <h2 id="ch-shop-title" className="ch-title">Elige tus favoritos</h2>
        <template data-pagosya-product-template>
          <article className="ch-card">
            <a className="ch-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="ch-card__name" data-product-field="name">Producto</h3>
            <p className="ch-card__desc" data-product-field="description" />
            <p className="ch-card__price" data-product-field="price" />
            <button type="button" className="ch-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ch-grid" data-pagosya-catalog />
      </section>

      <section id="nosotros" className="ch-cloud-wrap" aria-labelledby="ch-cloud-title">
        <div className="ch-cloud">
          <svg className="ch-sticker" viewBox="0 0 120 120" aria-hidden="true">
            <defs><path id="ch-circle" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" /></defs>
            <circle cx="60" cy="60" r="58" />
            <text><textPath href="#ch-circle">HECHO CON CARIÑO ✦ HECHO CON CARIÑO ✦</textPath></text>
            <text x="60" y="68" textAnchor="middle" className="ch-sticker__face">☺</text>
          </svg>
          <h2 id="ch-cloud-title" className="ch-cloud__text">Creemos en el poder de lo simple.</h2>
          <a className="ch-btn ch-btn--lime ch-btn--small" href="#productos">Conócenos</a>
        </div>
      </section>

      <section className="ch-promise" aria-labelledby="ch-promise-title">
        <h2 id="ch-promise-title" className="ch-eyebrow">Nuestra promesa</h2>
        <ul>{promises.map(item => <li key={item.title}><h3>{item.title}</h3><p>{item.body}</p></li>)}</ul>
      </section>

      <section className="ch-wild" aria-labelledby="ch-wild-title">
        <h2 id="ch-wild-title" className="ch-title ch-center">En el día a día</h2>
        <div className="ch-wild__strip"><img src={photos.vida1} alt="Nuestros productos en uso" /><img src={photos.vida2} alt="Un momento con nuestros productos" /><img src={photos.vida3} alt="Detalle de un producto" /></div>
      </section>

      <section id="preguntas" className="ch-faq" aria-labelledby="ch-faq-title">
        <h2 id="ch-faq-title" className="ch-title ch-center">Preguntas</h2>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
