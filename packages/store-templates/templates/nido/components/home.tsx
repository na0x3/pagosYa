import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const rooms = [{ name: 'Sala', photo: 'sala' }, { name: 'Dormitorio', photo: 'dormitorio' }, { name: 'Cocina', photo: 'cocina' }, { name: 'Exterior', photo: 'exterior' }];
const materials = [
  { title: 'Naturales', body: 'Madera, lino, cerámica y fibras que envejecen bien.' },
  { title: 'Hechos para usarse', body: 'Piezas bonitas que también funcionan todos los días.' },
  { title: 'Bien embaladas', body: 'Llegan protegidas, listas para su lugar.' },
];
const faqs = [
  { q: '¿Cuánto tarda el envío?', a: 'Despachamos en 24 a 72 horas hábiles. Las piezas grandes pueden tardar un poco más.' },
  { q: '¿Qué pasa si algo llega dañado?', a: 'Escríbenos con una foto dentro de las 48 horas y lo resolvemos.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="ni-hero">
        <div className="ni-hero__copy">
          <h1 className="ni-display">Una casa que se siente <em>tuya</em></h1>
          <p className="ni-lead">Objetos simples, materiales nobles y piezas que acompañan tu día a día.</p>
          <a className="ni-btn" href="#tienda">Ver la tienda</a>
        </div>
        <div className="ni-hero__photo"><Parallax strength={80} mobileStrength={30} className="ni-drift"><img src={photos.hero} alt={`Un ambiente decorado con piezas de ${store.name}`} /></Parallax></div>
      </section>

      <section id="ambientes" className="ni-rooms" aria-labelledby="ni-rooms-title">
        <Reveal><h2 id="ni-rooms-title" className="ni-title">Por ambiente</h2></Reveal>
        <Reveal delay={100}><ul>{rooms.map(room => <li key={room.name}><a href="#tienda"><img src={photos[room.photo]} alt={room.name} /><span>{room.name}</span></a></li>)}</ul></Reveal>
      </section>

      <section id="tienda" className="ni-shop" aria-labelledby="ni-shop-title">
        <Reveal className="ni-shop__head"><h2 id="ni-shop-title" className="ni-title">Tienda</h2><p>Todo lo que tenemos, en un solo lugar.</p></Reveal>
        <template data-pagosya-product-template>
          <article className="ni-card">
            <a className="ni-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="ni-card__row"><h3 className="ni-card__name" data-product-field="name">Pieza</h3><span className="ni-card__price" data-product-field="price" /></div>
            <p className="ni-card__desc" data-product-field="description" />
            <button type="button" className="ni-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="ni-grid" data-pagosya-catalog />
      </section>

      <section id="materiales" className="ni-materials" aria-labelledby="ni-materials-title">
        <div className="ni-materials__photo"><Parallax strength={70} className="ni-drift ni-drift--deep"><img src={photos.material} alt="Detalle de los materiales" /></Parallax></div>
        <Reveal delay={120}>
          <h2 id="ni-materials-title" className="ni-title">Materiales que duran</h2>
          <dl>{materials.map(item => <div key={item.title}><dt>{item.title}</dt><dd>{item.body}</dd></div>)}</dl>
        </Reveal>
      </section>

      <section id="ayuda" className="ni-faq" aria-labelledby="ni-faq-title">
        <Reveal><h2 id="ni-faq-title" className="ni-title">Ayuda</h2></Reveal>
        <div>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
