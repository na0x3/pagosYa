import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const values = [
  { n: '100%', t: 'Hecho a mano', b: 'Cada pieza sale de las manos de un artesano, no de una fábrica.' },
  { n: 'Justo', t: 'Pago justo', b: 'Los talleres ponen su precio. Nosotros no regateamos.' },
  { n: 'Natural', t: 'Materiales de la tierra', b: 'Barro, lana, fibras y madera. Nada de plástico.' },
];
const faqs = [
  { q: '¿Todas las piezas son iguales?', a: 'No. Al ser hechas a mano, cada una tiene pequeñas diferencias que la hacen única.' },
  { q: '¿Cómo cuido mi pieza?', a: 'Cada producto llega con una tarjeta de cuidados según su material.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta, desde tu celular.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="ra-hero">
        <div className="ra-hero__photo"><Parallax strength={120} mobileStrength={40} className="ra-drift ra-drift--deep"><img src={photos.hero} alt={`Piezas de ${store.name} sobre una mesa`} /></Parallax></div>
        <Reveal className="ra-hero__card">
          <p className="ra-kicker">Hecho a mano</p>
          <h1 className="ra-display">Objetos con historia, para tu casa.</h1>
          <p className="ra-lead">Cerámica, textiles y canastos hechos por talleres que cuidan su oficio.</p>
          <a className="ra-btn" href="#tienda">Explorar la tienda</a>
        </Reveal>
      </section>

      <section className="ra-values" aria-label="Lo que nos importa">
        {values.map((item, index) => <Reveal key={item.t} delay={index * 80}><article><p className="ra-values__n">{item.n}</p><h2>{item.t}</h2><p>{item.b}</p></article></Reveal>)}
      </section>

      <section id="tienda" className="ra-shop" aria-labelledby="ra-shop-title">
        <Reveal className="ra-shop__head"><p className="ra-kicker">La tienda</p><h2 id="ra-shop-title" className="ra-title">Hecho por manos que conocemos</h2></Reveal>
        <template data-pagosya-product-template>
          <article className="ra-card">
            <a className="ra-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <p className="ra-card__maker">Taller artesanal</p>
            <h3 className="ra-card__name" data-product-field="name">Producto</h3>
            <p className="ra-card__price" data-product-field="price" />
            <button type="button" className="ra-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ra-grid" data-pagosya-catalog />
      </section>

      <section id="manos" className="ra-maker" aria-labelledby="ra-maker-title">
        <div className="ra-maker__photo"><Parallax strength={70} className="ra-drift"><img src={photos.artesana} alt="Manos de una artesana tejiendo en telar" /></Parallax></div>
        <Reveal delay={100}>
          <p className="ra-kicker">Quién lo hace</p>
          <h2 id="ra-maker-title" className="ra-title">“Cada tejido lleva días. Por eso dura años.”</h2>
          <p>Trabajamos directo con talleres familiares. Conocemos sus nombres, sus tiempos y sus técnicas, y te contamos la historia detrás de cada pieza.</p>
        </Reveal>
      </section>

      <section className="ra-band" aria-label="El taller">
        <Parallax strength={150} className="ra-drift ra-drift--deep"><img src={photos.taller} alt="" aria-hidden="true" /></Parallax>
        <Reveal><p className="ra-band__line">Hecho despacio.<br />Hecho para quedarse.</p></Reveal>
      </section>

      <section id="preguntas" className="ra-faq" aria-labelledby="ra-faq-title">
        <Reveal><h2 id="ra-faq-title" className="ra-title">Preguntas</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
