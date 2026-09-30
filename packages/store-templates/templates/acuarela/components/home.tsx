import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const categories = [
  { name: 'Óleo', tone: 'red' },
  { name: 'Acrílico', tone: 'blue' },
  { name: 'Acuarela', tone: 'ochre' },
  { name: 'Papel', tone: 'lilac' },
  { name: 'Pinceles', tone: 'ink' },
];

const sets = [
  { name: 'Set principiante', text: 'Doce acuarelas, tres pinceles y un bloc de papel grueso. Todo para empezar.', tone: 'red' },
  { name: 'Set de acrílicos', text: 'Diez colores básicos en tubos de 60 ml, listos para mezclar en la paleta.', tone: 'blue' },
  { name: 'Set de dibujo', text: 'Lápices de grafito, carboncillo, difuminos y un cuaderno de bocetos.', tone: 'ochre' },
];

const tips = [
  { n: '1', title: 'Empieza con tres colores', text: 'Un rojo, un azul y un amarillo bastan para mezclar casi cualquier tono.' },
  { n: '2', title: 'Papel grueso, siempre', text: 'Con 300 g o más el papel no se arruga cuando lo mojas.' },
  { n: '3', title: 'Lava tus pinceles', text: 'Con agua tibia y jabón neutro al terminar: duran años.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="ac-hero" aria-labelledby="ac-hero-title">
        <h1 id="ac-hero-title" className="ac-hero__name">{store.name}</h1>
        <div className="ac-hero__bar">
          <p className="ac-hero__lead">Materiales para pintores, ilustradores y creadores.</p>
          <a className="ac-btn" href="#pinturas">Comprar ahora</a>
        </div>
        <div className="ac-hero__photo"><img src={photos.p1} alt="Mesa de madera con latas, tubos de pintura y carretes de hilo en amarillo, azul y rojo" /></div>
      </section>

      <section id="pinturas" className="ac-shop" aria-labelledby="ac-shop-title">
        <Reveal className="ac-head">
          <h2 id="ac-shop-title" className="ac-title">Todo para crear</h2>
          <p className="ac-head__aside">Pinturas, papeles y herramientas de marcas que usamos en nuestro propio taller.</p>
        </Reveal>
        <ul className="ac-chips" aria-label="Categorías">
          {categories.map(cat => <li key={cat.name}><a className={`ac-chip ac-chip--${cat.tone}`} href="#pinturas">{cat.name}</a></li>)}
        </ul>
        <template data-pagosya-product-template>
          <article className="ac-card">
            <a className="ac-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="ac-card__name" data-product-field="name">Producto</h3>
            <p className="ac-card__price" data-product-field="price" />
            <button type="button" className="ac-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ac-grid" data-pagosya-catalog />
      </section>

      <section id="sets" className="ac-sets" aria-labelledby="ac-sets-title">
        <Reveal className="ac-head">
          <h2 id="ac-sets-title" className="ac-title">Sets con descuento</h2>
        </Reveal>
        <div className="ac-sets__grid">
          {sets.map((set, index) => <Reveal key={set.name} delay={index * 60}>
            <a className={`ac-set ac-set--${set.tone}`} href="#pinturas">
              <span className="ac-set__name">{set.name}</span>
              <span className="ac-set__text">{set.text}</span>
              <span className="ac-set__go">Ver el set →</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="consejos" className="ac-tips" aria-labelledby="ac-tips-title">
        <Reveal className="ac-head">
          <h2 id="ac-tips-title" className="ac-title">Consejos para empezar</h2>
        </Reveal>
        <ol className="ac-tips__list">
          {tips.map((tip, index) => <li key={tip.n}>
            <Reveal delay={index * 60}>
              <span className="ac-tips__n">{tip.n}</span>
              <b className="ac-tips__title">{tip.title}</b>
              <span className="ac-tips__text">{tip.text}</span>
            </Reveal>
          </li>)}
        </ol>
      </section>

      <section id="estudio" className="ac-studio" aria-labelledby="ac-studio-title">
        <div className="ac-studio__photos">
          <Parallax strength={60} mobileStrength={22} className="ac-drift"><img src={photos.estudio} alt="Escritorio de artista con un lienzo a medio pintar, pinceles y tubos de pintura" /></Parallax>
          <img className="ac-studio__small" src={photos.mesa} alt="Mesa de una clase de arte para niños con pinturas y papeles de colores" />
        </div>
        <Reveal className="ac-studio__copy">
          <p className="ac-kicker">Nuestro estudio</p>
          <h2 id="ac-studio-title" className="ac-title">Probamos todo antes de venderlo</h2>
          <p>Cada pintura, papel y pincel pasa por las manos de alguien de nuestro equipo. También damos talleres para niños y adultos los fines de semana.</p>
          <a className="ac-btn ac-btn--ink" href="#pinturas">Ver los materiales</a>
        </Reveal>
      </section>

      <section id="boletin" className="ac-news" aria-labelledby="ac-news-title" data-pagosya-subscribe-block>
        <Reveal className="ac-news__inner">
          <h2 id="ac-news-title" className="ac-news__title">Ofertas y consejos, en tu correo</h2>
          <p className="ac-news__text">Un mensaje al mes con novedades, sets y una idea para pintar.</p>
          <button type="button" className="ac-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="ac-news__field">Tu correo electrónico</span>
            <span className="ac-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="ac-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
