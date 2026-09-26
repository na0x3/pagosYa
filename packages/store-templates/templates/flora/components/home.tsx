import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const care = [
  { title: 'Luz', body: 'Cerca de una ventana, sin sol directo del mediodía.', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg> },
  { title: 'Riego', body: 'Cuando la tierra esté seca al tacto, no antes.', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3.5 4.4 6 7.7 6 10.8A6 6 0 0 1 6 13.8C6 10.7 8.5 7.4 12 3z" /></svg> },
  { title: 'Espacio', body: 'Una maceta con drenaje y lugar para crecer.', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14l-1.6 9H6.6L5 11zM12 11V6M12 6c0-2 1.5-3.5 3.5-3.5M12 6c0-2-1.5-3.5-3.5-3.5" /></svg> },
];
const faqs = [
  { q: '¿Cómo llegan las plantas?', a: 'Bien protegidas, en su maceta y regadas. Te enviamos una guía de cuidados con cada pedido.' },
  { q: '¿Puedo enviar flores como regalo?', a: 'Sí. Déjanos el nombre y una nota; las entregamos con tu mensaje.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="fl-hero">
        <div className="fl-hero__copy">
          <p className="fl-kicker">Plantas y flores</p>
          <h1 className="fl-display">Llena tu casa de vida</h1>
          <p className="fl-lead">Plantas que se adaptan a tu espacio y flores que dicen lo que quieres decir.</p>
          <a className="fl-btn" href="#tienda">Elegir las mías</a>
        </div>
        <div className="fl-hero__arches">
          <Parallax strength={40} mobileStrength={30}><img src={photos.hero1} alt={`Planta de ${store.name}`} /></Parallax>
          <Parallax strength={80} mobileStrength={40}><img src={photos.hero2} alt="Una planta en su maceta" /></Parallax>
          <Parallax strength={50} mobileStrength={20}><img src={photos.hero3} alt="Flores de temporada" /></Parallax>
        </div>
      </section>

      <section id="tienda" className="fl-shop" aria-labelledby="fl-shop-title">
        <Reveal><h2 id="fl-shop-title" className="fl-title">Para cada rincón</h2></Reveal>
        <template data-pagosya-product-template>
          <article className="fl-card">
            <a className="fl-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="fl-card__name" data-product-field="name">Planta</h3>
            <p className="fl-card__desc" data-product-field="description" />
            <div className="fl-card__row"><span className="fl-card__price" data-product-field="price" /><button type="button" className="fl-card__add" data-product-add>Agregar</button></div>
          </article>
        </template>
        <div className="fl-grid" data-pagosya-catalog />
      </section>

      <section id="cuidados" className="fl-care" aria-labelledby="fl-care-title">
        <Reveal><h2 id="fl-care-title" className="fl-title">Cuidarlas es fácil</h2></Reveal>
        <Reveal delay={100}><ul>{care.map(item => <li key={item.title}>{item.icon}<h3>{item.title}</h3><p>{item.body}</p></li>)}</ul></Reveal>
      </section>

      <section id="envios" className="fl-gift" aria-labelledby="fl-gift-title">
        <Reveal><img src={photos.ramo} alt="Ramo de flores" /></Reveal>
        <Reveal delay={120}>
          <h2 id="fl-gift-title" className="fl-title fl-title--left">Llegan como si las hubieras llevado tú</h2>
          <p>Las preparamos el mismo día, con una nota si quieres regalarlas.</p>
          <a className="fl-btn fl-btn--dark" href="#tienda">Enviar un regalo</a>
        </Reveal>
      </section>

      <section id="preguntas" className="fl-faq" aria-labelledby="fl-faq-title">
        <Reveal><h2 id="fl-faq-title" className="fl-title">Preguntas</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
