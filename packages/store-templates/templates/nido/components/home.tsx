import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const rooms = [{ name: copy.home_1, photo: 'sala' }, { name: copy.home_2, photo: 'dormitorio' }, { name: copy.home_3, photo: 'cocina' }, { name: copy.home_4, photo: 'exterior' }];
const materials = [
  { title: copy.home_5, body: copy.home_6 },
  { title: copy.home_7, body: copy.home_8 },
  { title: copy.home_9, body: copy.home_10 },
];
const faqs = [
  { q: copy.home_11, a: copy.home_12 },
  { q: copy.home_13, a: copy.home_14 },
  { q: copy.home_15, a: copy.home_16 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="ni-hero">
        <div className="ni-hero__copy">
          <h1 className="ni-display">{copy.home_17}<em>tuya</em></h1>
          <p className="ni-lead">{copy.home_18}</p>
          <a className="ni-btn" href="#tienda">{copy.home_19}</a>
        </div>
        <div className="ni-hero__photo"><Parallax strength={80} mobileStrength={30} className="ni-drift"><img src={photos.hero} alt={`Un ambiente decorado con piezas de ${store.name}`} /></Parallax></div>
      </section>

      <section id="ambientes" className="ni-rooms" aria-labelledby="ni-rooms-title">
        <Reveal><h2 id="ni-rooms-title" className="ni-title">{copy.home_20}</h2></Reveal>
        <Reveal delay={100}><ul>{rooms.map(room => <li key={room.name}><a href="#tienda"><img src={photos[room.photo]} alt={room.name} /><span>{room.name}</span></a></li>)}</ul></Reveal>
      </section>

      <section id="tienda" className="ni-shop" aria-labelledby="ni-shop-title">
        <Reveal className="ni-shop__head"><h2 id="ni-shop-title" className="ni-title">{copy.home_21}</h2><p>{copy.home_22}</p></Reveal>
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
        <div className="ni-materials__photo"><Parallax strength={70} className="ni-drift ni-drift--deep"><img src={photos.material} alt={copy.home_23} /></Parallax></div>
        <Reveal delay={120}>
          <h2 id="ni-materials-title" className="ni-title">{copy.home_24}</h2>
          <dl>{materials.map(item => <div key={item.title}><dt>{item.title}</dt><dd>{item.body}</dd></div>)}</dl>
        </Reveal>
      </section>

      <section id="ayuda" className="ni-faq" aria-labelledby="ni-faq-title">
        <Reveal><h2 id="ni-faq-title" className="ni-title">{copy.home_25}</h2></Reveal>
        <div>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
