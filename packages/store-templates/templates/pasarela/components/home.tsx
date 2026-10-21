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
      <div className="pa-mast" aria-hidden="true">{store.name}</div>
      <section id="inicio" className="pa-hero">
        <figure className="pa-hero__main"><Parallax strength={60} mobileStrength={14} className="pa-drift"><img src={photos.hero1} alt={`Colección de ${store.name}`} /></Parallax></figure>
        <div className="pa-hero__side">
          <div className="pa-hero__copy">
            <p className="pa-kicker">{copy.home_7}</p>
            <h1 className="pa-display">{copy.home_8}<em>{copy.home_9}</em></h1>
            <a className="pa-link" href="#coleccion">{copy.home_10}</a>
          </div>
          <div className="pa-hero__pair"><img src={photos.hero2} alt={copy.home_11} /><img src={photos.hero3} alt={copy.home_12} /></div>
        </div>
      </section>

      <section id="coleccion" className="pa-shop" aria-labelledby="pa-shop-title">
        <Reveal><header className="pa-shop__head"><h2 id="pa-shop-title" className="pa-title">{copy.home_13}</h2><p>{copy.home_14}</p></header></Reveal>
        <template data-pagosya-product-template>
          <article className="pa-card">
            <a className="pa-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="pa-card__row"><h3 className="pa-card__name" data-product-field="name">Prenda</h3><span className="pa-card__price" data-product-field="price" /></div>
            <button type="button" className="pa-card__add" data-product-add>Agregar a la bolsa</button>
          </article>
        </template>
        <div className="pa-grid" data-pagosya-catalog />
      </section>

      <blockquote id="frase" className="pa-quote"><Reveal><p>{copy.home_15}<em>cuidarse</em>.”</p></Reveal></blockquote>

      <section id="lookbook" className="pa-look" aria-labelledby="pa-look-title">
        <Reveal className="pa-look__head"><h2 id="pa-look-title" className="pa-title">{copy.home_16}</h2></Reveal>
        <Parallax strength={20}><figure className="pa-look__wide"><img src={photos.look1} alt={copy.home_17} /><figcaption>{copy.home_18}</figcaption></figure></Parallax>
        <Parallax strength={60}><figure className="pa-look__tall"><img src={photos.look2} alt={copy.home_19} /><figcaption>{copy.home_20}</figcaption></figure></Parallax>
      </section>

      <section id="preguntas" className="pa-faq" aria-labelledby="pa-faq-title">
        <Reveal><h2 id="pa-faq-title" className="pa-title">{copy.home_21}</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
