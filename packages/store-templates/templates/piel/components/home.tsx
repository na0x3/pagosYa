import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const tones = ['#f1e2d3', '#e3c6aa', '#cfa27f', '#a87756', '#7a5238', '#4d3324'];
const sizes = [copy.home_1, 'S', 'M', 'L', copy.home_2, '2X', '3X', '4X'];
const faqs = [
  { q: copy.home_3, a: copy.home_4 },
  { q: copy.home_5, a: copy.home_6 },
  { q: copy.home_7, a: copy.home_8 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="pi-hero">
        <div className="pi-hero__photo"><Parallax strength={70} mobileStrength={14} className="pi-drift pi-drift--deep"><img src={photos.hero} alt={`Conjunto de ${store.name}`} /></Parallax></div>
        <div className="pi-hero__copy">
          <p className="pi-kicker">{copy.home_9}</p>
          <h1 className="pi-display">{copy.home_10}</h1>
          <p className="pi-lead">{copy.home_11}</p>
          <ul className="pi-tones" aria-label="Tonos disponibles">{tones.map(tone => <li key={tone} style={{ background: tone }} />)}</ul>
          <a className="pi-btn" href="#tienda">{copy.home_12}</a>
        </div>
      </section>

      <section id="tienda" className="pi-shop" aria-labelledby="pi-shop-title">
        <Reveal className="pi-shop__head"><h2 id="pi-shop-title" className="pi-title">{copy.home_13}</h2><a className="pi-more" href="#tienda">{copy.home_14}</a></Reveal>
        <template data-pagosya-product-template>
          <article className="pi-card">
            <a className="pi-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la prenda" /></a>
            <h3 className="pi-card__name" data-product-field="name">Prenda</h3>
            <p className="pi-card__price" data-product-field="price" />
            <button type="button" className="pi-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="pi-grid" data-pagosya-catalog />
      </section>

      <section id="tonos" className="pi-tonesband" aria-labelledby="pi-tones-title">
        <Reveal><h2 id="pi-tones-title" className="pi-title">{copy.home_15}</h2></Reveal>
        <div className="pi-tonesband__photo"><Parallax strength={60} className="pi-drift pi-drift--deep"><img src={photos.tonos} alt={copy.home_16} /></Parallax></div>
      </section>

      <section id="todos-los-cuerpos" className="pi-duo" aria-label="Juntas">
        <Parallax strength={70} className="pi-drift pi-drift--deep"><img src={photos.juntas} alt="" aria-hidden="true" /></Parallax>
        <Reveal><p className="pi-duo__line">{copy.home_17}</p></Reveal>
      </section>

      <section id="talles" className="pi-sizes" aria-labelledby="pi-sizes-title">
        <Reveal><h2 id="pi-sizes-title" className="pi-title">{copy.home_18}</h2></Reveal>
        <Reveal delay={80}><ul>{sizes.map(size => <li key={size}>{size}</li>)}</ul></Reveal>
        <div className="pi-faq">{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
