import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { photos } from './store-data';

const pillars = [
  { name: 'Sueño', text: 'Horarios regulares y un cuarto oscuro y fresco.' },
  { name: 'Movimiento', text: 'Caminar cada día vale más que entrenar una vez.' },
  { name: 'Nutrición', text: 'Comida real, variada y con mucha fibra.' },
  { name: 'Estrés', text: 'Pausas cortas para respirar y desconectar.' },
];

const posts = [
  { title: 'Qué dice el sueño sobre tu salud', date: '12 mar', read: '6 min' },
  { title: 'Cinco hábitos simples para la mañana', date: '4 mar', read: '4 min' },
  { title: 'Cómo leer la etiqueta de un suplemento', date: '25 feb', read: '5 min' },
];

const reviews = [
  { quote: 'Me gusta que expliquen cada ingrediente sin exagerar.', who: 'Alejandro, La Paz' },
  { quote: 'El blog me ayudó a ordenar mis rutinas.', who: 'Carla, Santa Cruz' },
  { quote: 'Empaque sobrio y envío puntual.', who: 'Mauricio, Cochabamba' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="lg-hero" aria-labelledby="lg-hero-title">
        <Parallax strength={50} mobileStrength={20} className="lg-hero__bg"><img src={photos.p1} alt="Hombre de unos cincuenta años con barba gris junto a una ventana con luz suave" /></Parallax>
        <div className="lg-hero__copy">
          <h1 id="lg-hero-title" className="lg-hero__title">Descubre los secretos de la longevidad</h1>
          <a className="lg-btn" href="#productos">Empieza tu camino →</a>
        </div>
        <a className="lg-feature" href="#blog">
          <img src={photos.articulo} alt="Mano de una persona dormida sobre sábanas blancas a la luz de la mañana" />
          <span><small>Artículo destacado</small>Qué dice el sueño sobre tu salud</span>
        </a>
      </section>

      <section id="productos" className="lg-shop" aria-labelledby="lg-shop-title">
        <Reveal className="lg-head">
          <h2 id="lg-shop-title" className="lg-title">Productos</h2>
          <p className="lg-head__aside">Fórmulas simples, con ingredientes que puedes leer.</p>
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
          <h2 id="lg-pillars-title" className="lg-title">Cuatro pilares</h2>
        </Reveal>
        <div className="lg-pillars__grid">
          {pillars.map((item, index) => <Reveal key={item.name} delay={index * 60}>
            <div className="lg-pillar"><b>{item.name}</b><span>{item.text}</span></div>
          </Reveal>)}
        </div>
      </section>

      <section id="blog" className="lg-blog" aria-labelledby="lg-blog-title">
        <Reveal className="lg-head">
          <h2 id="lg-blog-title" className="lg-title">Del blog</h2>
        </Reveal>
        <div className="lg-blog__grid">
          {posts.map((post, index) => <Reveal key={post.title} delay={index * 60}>
            <a className="lg-post" href="#blog"><small>{post.date} · {post.read}</small><b>{post.title}</b><span>Leer artículo →</span></a>
          </Reveal>)}
        </div>
      </section>

      <section id="evidencia" className="lg-evi" aria-labelledby="lg-evi-title">
        <img className="lg-evi__photo" src={photos.laboratorio} alt="Mesa de laboratorio limpia con frascos de vidrio ámbar" />
        <Reveal className="lg-evi__copy">
          <h2 id="lg-evi-title" className="lg-title">Cómo elegimos cada ingrediente</h2>
          <p>Revisamos la fuente, la pureza y la dosis de cada ingrediente, y lo publicamos en la etiqueta. No prometemos curas: un suplemento acompaña hábitos, no los reemplaza.</p>
          <p>Consulta a tu médico antes de empezar cualquier suplemento.</p>
        </Reveal>
      </section>

      <section id="resenas" className="lg-rev" aria-labelledby="lg-rev-title">
        <Reveal className="lg-head">
          <h2 id="lg-rev-title" className="lg-title">Lo que dicen</h2>
        </Reveal>
        <div className="lg-rev__grid">
          {reviews.map((rev, index) => <Reveal key={rev.who} delay={index * 60}>
            <figure className="lg-rev__item"><blockquote>{rev.quote}</blockquote><figcaption>{rev.who}</figcaption></figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="lg-news" aria-labelledby="lg-news-title" data-pagosya-subscribe-block>
        <Reveal className="lg-news__inner">
          <h2 id="lg-news-title" className="lg-news__title">Un artículo por semana</h2>
          <p className="lg-news__text">Lecturas breves sobre hábitos y bienestar, en tu correo.</p>
          <button type="button" className="lg-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="lg-news__field">Tu correo electrónico</span>
            <span className="lg-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="lg-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
