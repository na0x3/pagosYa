import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const info = [
  { title: copy.home_1, body: copy.home_2 },
  { title: copy.home_3, body: copy.home_4 },
  { title: copy.home_5, body: copy.home_6 },
];
const faqs = [
  { q: copy.home_7, a: copy.home_8 },
  { q: copy.home_9, a: copy.home_10 },
  { q: copy.home_11, a: copy.home_12 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="li-hero">
        <div className="li-hero__copy">
          <p className="li-mono">{copy.home_13}</p>
          <h1 className="li-display">{copy.home_14}</h1>
          <a className="li-link" href="#obras">{copy.home_15}</a>
        </div>
        <figure className="li-hang">
          <div className="li-mat"><div className="li-mat__window"><Parallax strength={60} mobileStrength={30} className="li-drift"><img src={photos.obra} alt={`Obra destacada de ${store.name}`} /></Parallax></div></div>
          <figcaption className="li-placard"><strong>{copy.home_16}</strong><span>{copy.home_17}</span><span>{store.name}</span></figcaption>
        </figure>
      </section>

      <section id="obras" className="li-shop" aria-labelledby="li-shop-title">
        <Reveal><header className="li-shop__head"><h2 id="li-shop-title" className="li-title">{copy.home_18}</h2><p className="li-mono">{copy.home_19}</p></header></Reveal>
        <template data-pagosya-product-template>
          <article className="li-card">
            <a className="li-card__mat" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la obra" /></a>
            <div className="li-card__placard">
              <h3 className="li-card__name" data-product-field="name">Obra</h3>
              <p className="li-card__desc" data-product-field="description" />
              <p className="li-card__price" data-product-field="price" />
              <button type="button" className="li-card__add" data-product-add>Agregar al carrito</button>
            </div>
          </article>
        </template>
        <div className="li-grid" data-pagosya-catalog />
      </section>

      <section id="artista" className="li-artist" aria-labelledby="li-artist-title">
        <Reveal><img src={photos.estudio} alt={copy.home_20} /></Reveal>
        <Reveal delay={120}>
          <p className="li-mono">{copy.home_21}</p>
          <h2 id="li-artist-title" className="li-title">{copy.home_22}</h2>
          <p>{copy.home_23}</p>
        </Reveal>
      </section>

      <section id="envio" className="li-info" aria-labelledby="li-info-title">
        <Reveal><h2 id="li-info-title" className="li-title">{copy.home_24}</h2></Reveal>
        <Reveal delay={100}><dl>{info.map(item => <div key={item.title}><dt className="li-mono">{item.title}</dt><dd>{item.body}</dd></div>)}</dl></Reveal>
      </section>

      <section id="preguntas" className="li-faq" aria-labelledby="li-faq-title">
        <Reveal><h2 id="li-faq-title" className="li-title">{copy.home_25}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
