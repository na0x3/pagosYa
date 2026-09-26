import Shell from './Shell';
import { store, photos } from './store-data';

const ticker = ['Nueva colección disponible', 'Stock limitado', 'Envíos a todo el país', 'Paga con QR'];
const faqs = [
  { q: '¿Vuelven a reponer?', a: 'Algunas piezas sí, otras no. Si una se agota, escríbenos y te avisamos.' },
  { q: '¿Cómo elijo la talla?', a: 'Cada prenda indica sus medidas. El corte es amplio: si dudas, elige tu talla de siempre.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  const row = [...ticker, ...ticker, ...ticker];
  return <Shell>
    <main id="contenido">
      <section className="ur-hero">
        <img src={photos.hero} alt={`Colección de ${store.name}`} />
        <div className="ur-hero__copy">
          <p className="ur-mono">// Colección actual</p>
          <h1 className="ur-display"><span>Sin</span> <span>pedir</span> <span>permiso</span></h1>
          <a className="ur-btn" href="#coleccion">Ver la colección →</a>
        </div>
      </section>
      <div className="ur-ticker" aria-hidden="true"><div className="ur-ticker__track">{[...row, ...row].map((text, index) => <span key={index}>{text} ✕</span>)}</div></div>

      <section id="coleccion" className="ur-shop" aria-labelledby="ur-shop-title">
        <div className="ur-shop__head"><h2 id="ur-shop-title" className="ur-title">Colección</h2><p className="ur-mono">Todo lo disponible ahora</p></div>
        <template data-pagosya-product-template>
          <article className="ur-card">
            <a className="ur-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="ur-card__meta"><h3 className="ur-card__name" data-product-field="name">Prenda</h3><span className="ur-card__price" data-product-field="price" /></div>
            <button type="button" className="ur-card__add" data-product-add>+ Agregar</button>
          </article>
        </template>
        <div className="ur-grid" data-pagosya-catalog />
      </section>

      <section id="lookbook" className="ur-look" aria-labelledby="ur-look-title">
        <h2 id="ur-look-title" className="ur-title ur-title--light">Lookbook</h2>
        <div className="ur-look__grid">
          <figure><img src={photos.look1} alt="Look de la colección" /><figcaption className="ur-mono">Look 01</figcaption></figure>
          <figure><img src={photos.look2} alt="Accesorio de la colección" /><figcaption className="ur-mono">Look 02</figcaption></figure>
          <figure><img src={photos.look3} alt="Calzado de la colección" /><figcaption className="ur-mono">Look 03</figcaption></figure>
        </div>
      </section>

      <section id="preguntas" className="ur-faq" aria-labelledby="ur-faq-title">
        <h2 id="ur-faq-title" className="ur-title">Info</h2>
        <div>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
