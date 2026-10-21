import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const ticker = [copy.home_1, copy.home_2, copy.home_3, copy.home_4];
const faqs = [
  { q: copy.home_5, a: copy.home_6 },
  { q: copy.home_7, a: copy.home_8 },
  { q: copy.home_9, a: copy.home_10 },
];

export default function Home() {
  const row = [...ticker, ...ticker, ...ticker];
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="ur-hero">
        <Parallax strength={150} mobileStrength={50} className="ur-hero__media"><img src={photos.hero} alt={`Colección de ${store.name}`} /></Parallax>
        <div className="ur-hero__copy">
          <p className="ur-mono">// Colección actual</p>
          <h1 className="ur-display"><span>{copy.home_11}</span> <span>pedir</span> <span>permiso</span></h1>
          <a className="ur-btn" href="#coleccion">{copy.home_12}</a>
        </div>
      </section>
      <div id="cinta" className="ur-ticker" aria-hidden="true"><div className="ur-ticker__track">{[...row, ...row].map((text, index) => <span key={index}>{text} ✕</span>)}</div></div>

      <section id="coleccion" className="ur-shop" aria-labelledby="ur-shop-title">
        <Reveal className="ur-shop__head"><h2 id="ur-shop-title" className="ur-title">{copy.home_13}</h2><p className="ur-mono">{copy.home_14}</p></Reveal>
        <template data-pagosya-product-template>
          <article className="ur-card">
            <a className="ur-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="ur-card__meta"><h3 className="ur-card__name" data-product-field="name">Prenda</h3><span className="ur-card__price" data-product-field="price" /></div>
            <button type="button" className="ur-card__add" data-product-add>+ Agregar</button>
          </article>
        </template>
        <div className="ur-grid" data-pagosya-catalog />
      </section>

      <section id="lookbook" className="ur-look" aria-labelledby="ur-look-title">
        <Reveal><h2 id="ur-look-title" className="ur-title ur-title--light">{copy.home_15}</h2></Reveal>
        <div className="ur-look__grid">
          <Reveal><figure><img src={photos.look1} alt={copy.home_16} /><figcaption className="ur-mono">{copy.home_17}</figcaption></figure></Reveal>
          <Reveal delay={100}><figure><img src={photos.look2} alt={copy.home_18} /><figcaption className="ur-mono">{copy.home_19}</figcaption></figure></Reveal>
          <Reveal delay={200}><figure><img src={photos.look3} alt={copy.home_20} /><figcaption className="ur-mono">{copy.home_21}</figcaption></figure></Reveal>
        </div>
      </section>

      <section id="preguntas" className="ur-faq" aria-labelledby="ur-faq-title">
        <Reveal><h2 id="ur-faq-title" className="ur-title">{copy.home_22}</h2></Reveal>
        <div>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
