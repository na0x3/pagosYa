import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const faqs = [
  { q: copy.home_1, a: copy.home_2 },
  { q: copy.home_3, a: copy.home_4 },
  { q: copy.home_5, a: copy.home_6 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="pg-hero">
        <Parallax strength={120} mobileStrength={40} className="pg-drift pg-drift--deep"><img src={photos.hero} alt={`Interior de ${store.name}`} /></Parallax>
        <div className="pg-hero__card">
          <p className="pg-kicker">{copy.home_7}</p>
          <h1 className="pg-display">{copy.home_8}</h1>
          <p className="pg-lead">{copy.home_9}</p>
          <a className="pg-btn" href="#libros">{copy.home_10}</a>
        </div>
      </section>

      <section id="libros" className="pg-shop" aria-labelledby="pg-shop-title">
        <Reveal className="pg-shop__head"><h2 id="pg-shop-title" className="pg-title">{copy.home_11}</h2><p>{copy.home_12}</p></Reveal>
        <template data-pagosya-product-template>
          <article className="pg-book">
            <a className="pg-book__cover" data-product-link href="product.html"><img data-product-field="image" alt="Portada del libro" /><span className="pg-book__note">Nos encantó</span></a>
            <h3 className="pg-book__title" data-product-field="name">Libro</h3>
            <p className="pg-book__desc" data-product-field="description" />
            <div className="pg-book__row"><span className="pg-book__price" data-product-field="price" /><button type="button" className="pg-book__add" data-product-add>Agregar</button></div>
          </article>
        </template>
        <div className="pg-grid" data-pagosya-catalog />
      </section>

      <blockquote id="frase" className="pg-quote"><Reveal><p>{copy.home_13}</p></Reveal></blockquote>

      <section id="en-casa" className="pg-home" aria-labelledby="pg-home-title">
        <Reveal><img src={photos.lectura} alt={copy.home_14} /></Reveal>
        <Reveal delay={120}>
          <h2 id="pg-home-title" className="pg-title">{copy.home_15}</h2>
          <p>{copy.home_16}</p>
          <a className="pg-link" href="#libros">{copy.home_17}</a>
        </Reveal>
      </section>

      <section id="libreria" className="pg-store" aria-labelledby="pg-store-title">
        <Reveal><h2 id="pg-store-title" className="pg-title pg-center">{copy.home_18}</h2></Reveal>
        <div className="pg-mosaic">
          <Parallax strength={40}><img src={photos.local1} alt={copy.home_19} /></Parallax>
          <Parallax strength={-50}><img src={photos.local2} alt={copy.home_20} /></Parallax>
          <Parallax strength={70}><img src={photos.pila} alt={copy.home_21} /></Parallax>
        </div>
      </section>

      <section id="preguntas" className="pg-faq" aria-labelledby="pg-faq-title">
        <Reveal><h2 id="pg-faq-title" className="pg-title">{copy.home_22}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
