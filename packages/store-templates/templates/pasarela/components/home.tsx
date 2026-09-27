import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const faqs = [
  { q: '¿Cómo elijo mi talla?', a: 'Cada prenda indica sus medidas. Si dudas entre dos, escríbenos y te ayudamos.' },
  { q: '¿Puedo cambiar una prenda?', a: 'Sí, dentro de los 7 días de recibida, sin uso y con su etiqueta.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <div className="pa-mast" aria-hidden="true">{store.name}</div>
      <section id="inicio" className="pa-hero">
        <figure className="pa-hero__main"><Parallax strength={60} mobileStrength={14} className="pa-drift"><img src={photos.hero1} alt={`Colección de ${store.name}`} /></Parallax></figure>
        <div className="pa-hero__side">
          <div className="pa-hero__copy">
            <p className="pa-kicker">Temporada actual</p>
            <h1 className="pa-display">Menos, <em>pero mejor.</em></h1>
            <a className="pa-link" href="#coleccion">Ver la colección</a>
          </div>
          <div className="pa-hero__pair"><img src={photos.hero2} alt="Detalle de una prenda" /><img src={photos.hero3} alt="Accesorio de la colección" /></div>
        </div>
      </section>

      <section id="coleccion" className="pa-shop" aria-labelledby="pa-shop-title">
        <Reveal><header className="pa-shop__head"><h2 id="pa-shop-title" className="pa-title">La colección</h2><p>Piezas pensadas para combinarse entre sí.</p></header></Reveal>
        <template data-pagosya-product-template>
          <article className="pa-card">
            <a className="pa-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="pa-card__row"><h3 className="pa-card__name" data-product-field="name">Prenda</h3><span className="pa-card__price" data-product-field="price" /></div>
            <button type="button" className="pa-card__add" data-product-add>Agregar a la bolsa</button>
          </article>
        </template>
        <div className="pa-grid" data-pagosya-catalog />
      </section>

      <blockquote id="frase" className="pa-quote"><Reveal><p>“Vestirse bien es una forma de <em>cuidarse</em>.”</p></Reveal></blockquote>

      <section id="lookbook" className="pa-look" aria-labelledby="pa-look-title">
        <Reveal className="pa-look__head"><h2 id="pa-look-title" className="pa-title">Lookbook</h2></Reveal>
        <Parallax strength={20}><figure className="pa-look__wide"><img src={photos.look1} alt="Look de la temporada" /><figcaption>Look 1 — Para el día</figcaption></figure></Parallax>
        <Parallax strength={60}><figure className="pa-look__tall"><img src={photos.look2} alt="Accesorio de temporada" /><figcaption>Look 2 — Los detalles</figcaption></figure></Parallax>
      </section>

      <section id="preguntas" className="pa-faq" aria-labelledby="pa-faq-title">
        <Reveal><h2 id="pa-faq-title" className="pa-title">Preguntas</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
