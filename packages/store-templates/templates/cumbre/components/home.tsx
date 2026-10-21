import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const uses = [
  { title: copy.home_1, body: copy.home_2, photo: 'uso1' },
  { title: copy.home_3, body: copy.home_4, photo: 'uso2' },
  { title: copy.home_5, body: copy.home_6, photo: 'uso3' },
];
const faqs = [
  { q: copy.home_7, a: copy.home_8 },
  { q: copy.home_9, a: copy.home_10 },
  { q: copy.home_11, a: copy.home_12 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="cu-hero">
        <Parallax strength={120} mobileStrength={50} className="cu-drift"><img src={photos.hero} alt={`Equipo de ${store.name} en la montaña`} /></Parallax>
        <div className="cu-hero__copy">
          <p className="cu-kicker">{copy.home_13}</p>
          <h1 className="cu-display">{copy.home_14}</h1>
          <a className="cu-btn" href="#novedades">{copy.home_15}</a>
        </div>
      </section>

      <section id="novedades" className="cu-shop" aria-labelledby="cu-new">
        <Reveal className="cu-shop__head"><h2 id="cu-new" className="cu-title">{copy.home_16}</h2><a href="#coleccion" className="cu-more">{copy.home_17}</a></Reveal>
        <template data-pagosya-product-template>
          <article className="cu-card">
            <a className="cu-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /><span className="cu-card__tag">Edición limitada</span></a>
            <h3 className="cu-card__name" data-product-field="name">Producto</h3>
            <p className="cu-card__desc" data-product-field="description" />
            <p className="cu-card__price" data-product-field="price" />
            <button type="button" className="cu-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="cu-grid" data-pagosya-catalog />
      </section>

      <section id="coleccion" className="cu-banner" aria-labelledby="cu-banner-title">
        <Parallax strength={160} className="cu-drift cu-drift--deep"><img src={photos.banner} alt="" aria-hidden="true" /></Parallax>
        <Reveal className="cu-banner__copy">
          <h2 id="cu-banner-title" className="cu-banner__title">{copy.home_18}</h2>
          <a className="cu-btn" href="#novedades">{copy.home_19}</a>
        </Reveal>
      </section>

      <section id="usos" className="cu-uses" aria-labelledby="cu-uses-title">
        <Reveal><h2 id="cu-uses-title" className="cu-title cu-center">{copy.home_20}</h2></Reveal>
        <ul>{uses.map(use => <li key={use.title}><a href="#novedades"><img src={photos[use.photo]} alt={use.title} /><h3>{use.title}</h3><p>{use.body}</p></a></li>)}</ul>
      </section>

      <section id="preguntas" className="cu-faq" aria-labelledby="cu-faq-title">
        <Reveal><h2 id="cu-faq-title" className="cu-title">{copy.home_21}</h2></Reveal>
        <div>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
