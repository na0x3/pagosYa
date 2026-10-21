import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const tiles = [
  { label: copy.home_1, photo: 'p1', tone: 'blue' },
  { label: copy.home_2, photo: 'p2', tone: 'green' },
  { label: copy.home_3, photo: 'p3', tone: 'pink' },
];
const promises = [
  { title: copy.home_4, body: copy.home_5 },
  { title: copy.home_6, body: copy.home_7 },
  { title: copy.home_8, body: copy.home_9 },
];
const faqs = [
  { q: copy.home_10, a: copy.home_11 },
  { q: copy.home_12, a: copy.home_13 },
  { q: copy.home_14, a: copy.home_15 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="ch-hero">
        <div className="ch-hero__panel">
          <h1 className="ch-display">{copy.home_16}</h1>
          <p className="ch-lead">{copy.home_17}</p>
          <a className="ch-btn ch-btn--lime" href="#productos">{copy.home_18}</a>
        </div>
        <div className="ch-hero__media">
          <svg className="ch-hero__wave" viewBox="0 0 80 800" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0 H40 C80 100 0 200 40 300 C80 400 0 500 40 600 C80 700 0 750 40 800 H0 Z" /></svg>
          <Parallax strength={60} mobileStrength={20} className="ch-drift"><img src={photos.hero} alt={`Productos de ${store.name}`} /></Parallax>
        </div>
      </section>

      <section id="categorias" className="ch-cats" aria-labelledby="ch-cats-title">
        <Reveal><h2 id="ch-cats-title" className="ch-title ch-center">{copy.home_19}</h2></Reveal>
        <Reveal delay={100}><ul className="ch-tiles">{tiles.map(tile => <li key={tile.label}><a href="#productos" className={`ch-tile ch-tile--${tile.tone}`}><img src={photos[tile.photo]} alt={tile.label} /><span>{tile.label}</span></a></li>)}</ul></Reveal>
      </section>

      <section id="productos" className="ch-shop" aria-labelledby="ch-shop-title">
        <Reveal><h2 id="ch-shop-title" className="ch-title">{copy.home_20}</h2></Reveal>
        <template data-pagosya-product-template>
          <article className="ch-card">
            <a className="ch-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="ch-card__name" data-product-field="name">Producto</h3>
            <p className="ch-card__desc" data-product-field="description" />
            <p className="ch-card__price" data-product-field="price" />
            <button type="button" className="ch-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ch-grid" data-pagosya-catalog />
      </section>

      <section id="nosotros" className="ch-cloud-wrap" aria-labelledby="ch-cloud-title">
        <div className="ch-cloud">
          <svg className="ch-sticker" viewBox="0 0 120 120" aria-hidden="true">
            <defs><path id="ch-circle" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" /></defs>
            <circle cx="60" cy="60" r="58" />
            <text><textPath href="#ch-circle">{copy.home_21}</textPath></text>
            <text x="60" y="68" textAnchor="middle" className="ch-sticker__face">☺</text>
          </svg>
          <Reveal><h2 id="ch-cloud-title" className="ch-cloud__text">{copy.home_22}</h2></Reveal>
          <a className="ch-btn ch-btn--lime ch-btn--small" href="#productos">{copy.home_23}</a>
        </div>
      </section>

      <section id="promesa" className="ch-promise" aria-labelledby="ch-promise-title">
        <h2 id="ch-promise-title" className="ch-eyebrow">{copy.home_24}</h2>
        <Reveal delay={100}><ul>{promises.map(item => <li key={item.title}><h3>{item.title}</h3><p>{item.body}</p></li>)}</ul></Reveal>
      </section>

      <section id="dia-a-dia" className="ch-wild" aria-labelledby="ch-wild-title">
        <Reveal><h2 id="ch-wild-title" className="ch-title ch-center">{copy.home_25}</h2></Reveal>
        <div className="ch-wild__strip">
          <Parallax strength={30}><img src={photos.vida1} alt={copy.home_26} /></Parallax>
          <Parallax strength={-40}><img src={photos.vida2} alt={copy.home_27} /></Parallax>
          <Parallax strength={50}><img src={photos.vida3} alt={copy.home_28} /></Parallax>
        </div>
      </section>

      <section id="preguntas" className="ch-faq" aria-labelledby="ch-faq-title">
        <Reveal><h2 id="ch-faq-title" className="ch-title ch-center">{copy.home_29}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
