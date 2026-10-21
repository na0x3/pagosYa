import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { photos, copy } from './store-data';

const pillars = [
  { name: copy.home_1, text: copy.home_2 },
  { name: copy.home_3, text: copy.home_4 },
  { name: copy.home_5, text: copy.home_6 },
  { name: copy.home_7, text: copy.home_8 },
];

const posts = [
  { title: copy.home_9, date: '12 mar', read: '6 min' },
  { title: copy.home_10, date: '4 mar', read: '4 min' },
  { title: copy.home_11, date: '25 feb', read: '5 min' },
];

const reviews = [
  { quote: copy.home_12, who: copy.home_13 },
  { quote: copy.home_14, who: copy.home_15 },
  { quote: copy.home_16, who: copy.home_17 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="lg-hero" aria-labelledby="lg-hero-title">
        <Parallax strength={50} mobileStrength={20} className="lg-hero__bg"><img src={photos.p1} alt={copy.home_18} /></Parallax>
        <div className="lg-hero__copy">
          <h1 id="lg-hero-title" className="lg-hero__title">{copy.home_19}</h1>
          <a className="lg-btn" href="#productos">{copy.home_20}</a>
        </div>
        <a className="lg-feature" href="#blog">
          <img src={photos.articulo} alt={copy.home_21} />
          <span><small>{copy.home_22}</small>{copy.home_23}</span>
        </a>
      </section>

      <section id="productos" className="lg-shop" aria-labelledby="lg-shop-title">
        <Reveal className="lg-head">
          <h2 id="lg-shop-title" className="lg-title">{copy.home_24}</h2>
          <p className="lg-head__aside">{copy.home_25}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="lg-card">
            <a className="lg-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="lg-card__name" data-product-field="name">Producto</h3>
            <p className="lg-card__price" data-product-field="price" />
            <button type="button" className="lg-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="lg-grid" data-pagosya-catalog />
      </section>

      <section id="pilares" className="lg-pillars" aria-labelledby="lg-pillars-title">
        <Reveal className="lg-head">
          <h2 id="lg-pillars-title" className="lg-title">{copy.home_26}</h2>
        </Reveal>
        <div className="lg-pillars__grid">
          {pillars.map((item, index) => <Reveal key={item.name} delay={index * 60}>
            <div className="lg-pillar"><b>{item.name}</b><span>{item.text}</span></div>
          </Reveal>)}
        </div>
      </section>

      <section id="blog" className="lg-blog" aria-labelledby="lg-blog-title">
        <Reveal className="lg-head">
          <h2 id="lg-blog-title" className="lg-title">{copy.home_27}</h2>
        </Reveal>
        <div className="lg-blog__grid">
          {posts.map((post, index) => <Reveal key={post.title} delay={index * 60}>
            <a className="lg-post" href="#blog"><small>{post.date} · {post.read}</small><b>{post.title}</b><span>Leer artículo →</span></a>
          </Reveal>)}
        </div>
      </section>

      <section id="evidencia" className="lg-evi" aria-labelledby="lg-evi-title">
        <img className="lg-evi__photo" src={photos.laboratorio} alt={copy.home_28} />
        <Reveal className="lg-evi__copy">
          <h2 id="lg-evi-title" className="lg-title">{copy.home_29}</h2>
          <p>{copy.home_30}</p>
          <p>{copy.home_31}</p>
        </Reveal>
      </section>

      <section id="resenas" className="lg-rev" aria-labelledby="lg-rev-title">
        <Reveal className="lg-head">
          <h2 id="lg-rev-title" className="lg-title">{copy.home_32}</h2>
        </Reveal>
        <div className="lg-rev__grid">
          {reviews.map((rev, index) => <Reveal key={rev.who} delay={index * 60}>
            <figure className="lg-rev__item"><blockquote>{rev.quote}</blockquote><figcaption>{rev.who}</figcaption></figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="lg-news" aria-labelledby="lg-news-title" data-pagosya-subscribe-block>
        <Reveal className="lg-news__inner">
          <h2 id="lg-news-title" className="lg-news__title">{copy.home_33}</h2>
          <p className="lg-news__text">{copy.home_34}</p>
          <button type="button" className="lg-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="lg-news__field">{copy.home_35}</span>
            <span className="lg-news__submit">{copy.home_36}</span>
          </button>
          <p role="status" className="lg-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
