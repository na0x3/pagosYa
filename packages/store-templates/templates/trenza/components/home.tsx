import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const chips = ['Cables', 'Fundas', 'Cargadores', 'Para viajar'];
const materials = [
  { t: 'Trenzado resistente', b: 'Cables que aguantan años de uso, sin pelarse.' },
  { t: 'Materiales nobles', b: 'Corcho, tela y cuero que se sienten bien en la mano.' },
  { t: 'Hechos para combinar', b: 'Colores tranquilos que quedan bien en cualquier lugar.' },
];
const faqs = [
  { q: '¿Funcionan con mi teléfono?', a: 'Sí: usamos USB-C y carga inalámbrica estándar. Si tienes dudas, escríbenos.' },
  { q: '¿Cuánto tarda el envío?', a: 'Despachamos en 24 horas a todo el país.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta, desde tu celular.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="tz-hero">
        <div className="tz-hero__frame"><Parallax strength={90} mobileStrength={30} className="tz-drift"><img src={photos.hero} alt={`Accesorios de ${store.name} en un escritorio`} /></Parallax></div>
        <Reveal className="tz-hero__card">
          <p className="tz-kicker">Accesorios para tu tecnología</p>
          <h1 className="tz-display">Carga tu día, con estilo.</h1>
          <p className="tz-lead">Cables, fundas y cargadores hechos con materiales que se sienten bien.</p>
          <a className="tz-btn" href="#productos">Comprar ahora</a>
        </Reveal>
      </section>

      <Reveal><ul className="tz-chips" aria-label="Categorías">{chips.map(chip => <li key={chip}><a href="#productos">{chip}</a></li>)}</ul></Reveal>

      <section id="productos" className="tz-shop" aria-labelledby="tz-shop-title">
        <Reveal className="tz-shop__head"><h2 id="tz-shop-title" className="tz-title">Los favoritos</h2><p>Lo que más llevan nuestros clientes.</p></Reveal>
        <template data-pagosya-product-template>
          <article className="tz-card">
            <a className="tz-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="tz-card__name" data-product-field="name">Producto</h3>
            <p className="tz-card__desc" data-product-field="description" />
            <div className="tz-card__row"><span className="tz-card__price" data-product-field="price" /><button type="button" className="tz-card__add" data-product-add>Agregar</button></div>
          </article>
        </template>
        <div className="tz-grid" data-pagosya-catalog />
      </section>

      <section id="materiales" className="tz-materials" aria-labelledby="tz-mat-title">
        <Reveal><h2 id="tz-mat-title" className="tz-title">Pensados para durar</h2></Reveal>
        <Reveal delay={100}><ul>{materials.map((item, index) => <li key={item.t}><span>{String(index + 1).padStart(2, '0')}</span><h3>{item.t}</h3><p>{item.b}</p></li>)}</ul></Reveal>
      </section>

      <section className="tz-life" aria-labelledby="tz-life-title">
        <Reveal className="tz-life__copy">
          <p className="tz-kicker">En casa y de viaje</p>
          <h2 id="tz-life-title" className="tz-title">Todo cargado, donde estés.</h2>
          <p>Un cargador junto a la cama, un cable en la mochila y una funda que aguanta el camino.</p>
          <a className="tz-btn tz-btn--ghost" href="#productos">Ver todo</a>
        </Reveal>
        <div className="tz-life__photos">
          <Parallax strength={40} className="tz-life__a"><img src={photos.casa} alt="Un cargador en la mesa de noche" /></Parallax>
          <Parallax strength={-50} className="tz-life__b"><img src={photos.viaje} alt="Accesorios listos para un viaje" /></Parallax>
        </div>
      </section>

      <section id="ayuda" className="tz-faq" aria-labelledby="tz-faq-title">
        <Reveal><h2 id="tz-faq-title" className="tz-title">Preguntas</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
