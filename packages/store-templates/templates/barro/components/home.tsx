import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const steps = [
  { title: 'Amasar', body: 'Preparamos el barro hasta que está listo para tomar forma.' },
  { title: 'Formar', body: 'Cada pieza se hace a mano o en el torno, sin moldes.' },
  { title: 'Esmaltar', body: 'Los colores cambian con el fuego: ninguna sale igual.' },
  { title: 'Hornear', body: 'Dos quemas lentas para que dure años.' },
];
const faqs = [
  { q: '¿Por qué mi pieza no es idéntica a la foto?', a: 'Porque está hecha a mano. Forma y esmalte varían un poco en cada una, y eso la hace única.' },
  { q: '¿Se pueden usar en el microondas?', a: 'Cada pieza indica en su ficha si es apta para microondas y lavavajillas.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="ba-hero">
        <div className="ba-hero__copy">
          <p className="ba-kicker">Hecho a mano</p>
          <h1 className="ba-display">Piezas con <span className="ba-scribble">alma<svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true"><path d="M2 14 C40 4 80 18 120 9 C150 3 175 12 198 6" /></svg></span>, hechas para usarse</h1>
          <p className="ba-lead">Cerámica y objetos hechos uno por uno. Cada pieza es distinta, como tu mesa.</p>
          <a className="ba-btn" href="#piezas">Ver las piezas</a>
        </div>
        <div className="ba-hero__blob"><Parallax strength={60} mobileStrength={30} className="ba-drift"><img src={photos.hero} alt={`Pieza de ${store.name}`} /></Parallax></div>
      </section>

      <section id="piezas" className="ba-shop" aria-labelledby="ba-shop-title">
        <Reveal>
          <h2 id="ba-shop-title" className="ba-title">Piezas disponibles</h2>
          <p className="ba-sub">Cuando se acaban, hacemos una nueva tanda.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ba-card">
            <a className="ba-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="ba-card__name" data-product-field="name">Pieza</h3>
            <p className="ba-card__price" data-product-field="price" />
            <button type="button" className="ba-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ba-grid" data-pagosya-catalog />
      </section>

      <section id="proceso" className="ba-process" aria-labelledby="ba-process-title">
        <Parallax strength={100} className="ba-drift ba-drift--deep"><img src={photos.manos} alt="Manos trabajando el barro" /></Parallax>
        <Reveal><h2 id="ba-process-title" className="ba-title ba-title--light">Así nace cada pieza</h2></Reveal>
        <Reveal delay={120}><ol>{steps.map((step, index) => <li key={step.title}><span>{index + 1}</span><h3>{step.title}</h3><p>{step.body}</p></li>)}</ol></Reveal>
      </section>

      <section id="taller" className="ba-maker" aria-labelledby="ba-maker-title">
        <Reveal><img src={photos.taller} alt="El taller" /></Reveal>
        <Reveal delay={120}>
          <p className="ba-kicker">Quién lo hace</p>
          <h2 id="ba-maker-title" className="ba-title">Del taller a tu casa</h2>
          <p>Trabajamos en un taller pequeño, sin prisa. Cada pieza pasa por nuestras manos varias veces antes de llegar a las tuyas.</p>
          <p className="ba-sign">— {store.name}</p>
        </Reveal>
      </section>

      <section id="preguntas" className="ba-faq" aria-labelledby="ba-faq-title">
        <Reveal><h2 id="ba-faq-title" className="ba-title">Preguntas</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
