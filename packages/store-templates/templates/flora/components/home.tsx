import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const care = [
  { title: copy.home_1, body: copy.home_2, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg> },
  { title: copy.home_3, body: copy.home_4, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3.5 4.4 6 7.7 6 10.8A6 6 0 0 1 6 13.8C6 10.7 8.5 7.4 12 3z" /></svg> },
  { title: copy.home_5, body: copy.home_6, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14l-1.6 9H6.6L5 11zM12 11V6M12 6c0-2 1.5-3.5 3.5-3.5M12 6c0-2-1.5-3.5-3.5-3.5" /></svg> },
];
const faqs = [
  { q: copy.home_7, a: copy.home_8 },
  { q: copy.home_9, a: copy.home_10 },
  { q: copy.home_11, a: copy.home_12 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="fl-hero">
        <div className="fl-hero__copy">
          <p className="fl-kicker">{copy.home_13}</p>
          <h1 className="fl-display">{copy.home_14}</h1>
          <p className="fl-lead">{copy.home_15}</p>
          <a className="fl-btn" href="#tienda">{copy.home_16}</a>
        </div>
        <div className="fl-hero__arches">
          <Parallax strength={40} mobileStrength={30}><img src={photos.hero1} alt={`Planta de ${store.name}`} /></Parallax>
          <Parallax strength={80} mobileStrength={40}><img src={photos.hero2} alt={copy.home_17} /></Parallax>
          <Parallax strength={50} mobileStrength={20}><img src={photos.hero3} alt={copy.home_18} /></Parallax>
        </div>
      </section>

      <section id="tienda" className="fl-shop" aria-labelledby="fl-shop-title">
        <Reveal><h2 id="fl-shop-title" className="fl-title">{copy.home_19}</h2></Reveal>
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
        <Reveal><h2 id="fl-care-title" className="fl-title">{copy.home_20}</h2></Reveal>
        <Reveal delay={100}><ul>{care.map(item => <li key={item.title}>{item.icon}<h3>{item.title}</h3><p>{item.body}</p></li>)}</ul></Reveal>
      </section>

      <section id="envios" className="fl-gift" aria-labelledby="fl-gift-title">
        <Reveal><img src={photos.ramo} alt={copy.home_21} /></Reveal>
        <Reveal delay={120}>
          <h2 id="fl-gift-title" className="fl-title fl-title--left">{copy.home_22}</h2>
          <p>{copy.home_23}</p>
          <a className="fl-btn fl-btn--dark" href="#tienda">{copy.home_24}</a>
        </Reveal>
      </section>

      <section id="preguntas" className="fl-faq" aria-labelledby="fl-faq-title">
        <Reveal><h2 id="fl-faq-title" className="fl-title">{copy.home_25}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
