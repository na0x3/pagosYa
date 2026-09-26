import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const faqs = [
  { q: '¿De qué están hechas?', a: 'Oro de 18k o plata 925 con baño de oro. Cada producto indica su material.' },
  { q: '¿Se oscurecen?', a: 'No con el uso diario. Guárdalas secas y lejos de perfumes para que brillen siempre.' },
  { q: '¿Viene lista para regalar?', a: 'Sí, todas las joyas llegan en su caja con una bolsita de tela.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="ar-hero">
        <div className="ar-hero__photo"><Parallax strength={70} mobileStrength={30} className="ar-drift"><img src={photos.hero} alt={`Joyas de ${store.name}`} /></Parallax></div>
        <div className="ar-hero__copy">
          <p className="ar-kicker">Joyas finas</p>
          <h1 className="ar-display">Para usar todos los días, <em>no para guardar.</em></h1>
          <p className="ar-lead">Aros, collares y anillos en oro y plata, pensados para combinarse entre sí.</p>
          <a className="ar-btn" href="#joyas">Ver las joyas</a>
        </div>
      </section>

      <section className="ar-cats" aria-label="Categorías">
        <Reveal><a href="#joyas"><img src={photos.p1} alt="Aros" /><span>Aros</span></a></Reveal>
        <Reveal delay={80}><a href="#joyas"><img src={photos.p2} alt="Collares" /><span>Collares</span></a></Reveal>
        <Reveal delay={160}><a href="#joyas"><img src={photos.p3} alt="Anillos" /><span>Anillos</span></a></Reveal>
      </section>

      <section id="joyas" className="ar-shop" aria-labelledby="ar-shop-title">
        <Reveal className="ar-shop__head"><h2 id="ar-shop-title" className="ar-title">Las más elegidas</h2></Reveal>
        <template data-pagosya-product-template>
          <article className="ar-card">
            <a className="ar-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la joya" /></a>
            <h3 className="ar-card__name" data-product-field="name">Joya</h3>
            <p className="ar-card__price" data-product-field="price" />
            <button type="button" className="ar-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ar-grid" data-pagosya-catalog />
      </section>

      <section className="ar-stack" aria-label="Combínalas">
        <Parallax strength={100} className="ar-drift ar-drift--deep"><img src={photos.mano} alt="" aria-hidden="true" /></Parallax>
        <Reveal className="ar-stack__card"><p className="ar-kicker">Combínalas</p><p className="ar-stack__line">Una sola joya dice algo. Tres cuentan tu historia.</p></Reveal>
      </section>

      <section id="regalos" className="ar-gift" aria-labelledby="ar-gift-title">
        <Reveal className="ar-gift__copy">
          <p className="ar-kicker">Regalos</p>
          <h2 id="ar-gift-title" className="ar-title">Lista para regalar</h2>
          <p>Cada joya llega en su caja, con una bolsita de tela y una tarjeta con tu mensaje.</p>
          <a className="ar-btn ar-btn--line" href="#joyas">Elegir un regalo</a>
        </Reveal>
        <div className="ar-gift__photo"><Parallax strength={60} className="ar-drift"><img src={photos.caja} alt="Caja de regalo con joyas" /></Parallax></div>
      </section>

      <section id="ayuda" className="ar-faq" aria-labelledby="ar-faq-title">
        <Reveal><h2 id="ar-faq-title" className="ar-title">Preguntas</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
