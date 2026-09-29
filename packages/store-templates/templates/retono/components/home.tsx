import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { photos } from './store-data';

const ages = [
  { name: 'Bebé', text: 'De 0 a 24 meses, con botones suaves.', tone: 'mint' },
  { name: 'Niños', text: 'De 2 a 8 años, hechos para correr.', tone: 'sun' },
  { name: 'Grandes', text: 'De 9 a 14 años, con más estilo.', tone: 'coral' },
];

const facts = [
  { title: 'Algodón peinado', text: 'Más suave desde el primer lavado.' },
  { title: 'Tintes sin químicos agresivos', text: 'Cuidamos la piel sensible de los niños.' },
  { title: 'Costuras planas', text: 'Sin etiquetas que rocen ni molesten.' },
];

const looks = [
  { name: 'Look de parque', text: 'Camiseta estampada, short y gorra para jugar todo el día.' },
  { name: 'Look de domingo', text: 'Camisa suave y pantalón cómodo para salir en familia.' },
];

const reviews = [
  { quote: 'La tela es suave y después de muchos lavados sigue igual.', who: 'Paola, La Paz' },
  { quote: 'A mi hijo le encantan los estampados. No quiere quitarse la camiseta.', who: 'Rodrigo, Tarija' },
  { quote: 'Las tallas son fieles y el envío llegó rapidísimo.', who: 'Ximena, Cochabamba' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="rt-hero" aria-labelledby="rt-hero-title">
        <h1 id="rt-hero-title" className="rt-sr">Ropa infantil</h1>
        <div className="rt-hero__strip">
          <img src={photos.p1} alt="Niño visto de espaldas con una camiseta verde estampada de nubes" />
          <img src={photos.p2} alt="Niño de pelo rizado sentado en un taburete con un conjunto verde" />
          <img src={photos.p3} alt="Niño sonriendo con lentes redondos amarillos y una gorra verde" />
        </div>
        <div className="rt-hero__card">
          <h2>Hecho para jugar</h2>
          <p>Ropa de algodón suave, colores alegres y costuras pensadas para correr, saltar y crecer.</p>
          <a className="rt-btn" href="#ropa">Ver ropa</a>
        </div>
      </section>

      <section id="ropa" className="rt-shop" aria-labelledby="rt-shop-title">
        <Reveal className="rt-head">
          <h2 id="rt-shop-title" className="rt-title">Ropa para jugar</h2>
          <p className="rt-head__aside">Novedades de la temporada, listas para estrenar.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="rt-card">
            <a className="rt-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="rt-card__name" data-product-field="name">Producto</h3>
            <p className="rt-card__price" data-product-field="price" />
            <button type="button" className="rt-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="rt-grid" data-pagosya-catalog />
      </section>

      <section id="edades" className="rt-ages" aria-labelledby="rt-ages-title">
        <Reveal className="rt-head">
          <h2 id="rt-ages-title" className="rt-title">Compra por edad</h2>
        </Reveal>
        <div className="rt-ages__grid">
          {ages.map((age, index) => <Reveal key={age.name} delay={index * 60}>
            <a className={`rt-age rt-age--${age.tone}`} href="#ropa"><b>{age.name}</b><span>{age.text}</span></a>
          </Reveal>)}
        </div>
      </section>

      <section id="algodon" className="rt-cotton" aria-labelledby="rt-cotton-title">
        <div className="rt-cotton__frame">
          <Parallax strength={40} mobileStrength={20} className="rt-drift"><img src={photos.tela} alt="Primer plano de tela de algodón estampada con pequeñas nubes verdes" /></Parallax>
        </div>
        <Reveal className="rt-cotton__copy">
          <h2 id="rt-cotton-title" className="rt-title">Algodón que se siente bien</h2>
          <ul className="rt-cotton__list">{facts.map(fact => <li key={fact.title}><b>{fact.title}</b><span>{fact.text}</span></li>)}</ul>
        </Reveal>
      </section>

      <section id="looks" className="rt-looks" aria-labelledby="rt-looks-title">
        <Reveal className="rt-head">
          <h2 id="rt-looks-title" className="rt-title">Looks para copiar</h2>
        </Reveal>
        <div className="rt-looks__grid">
          <img className="rt-looks__photo" src={photos.p4} alt="Ropa infantil doblada en colores vivos sobre una superficie blanca" />
          <img className="rt-looks__photo" src={photos.parque} alt="Niños jugando en un parque soleado" />
          {looks.map((look, index) => <Reveal key={look.name} delay={index * 60}>
            <div className="rt-look"><b>{look.name}</b><span>{look.text}</span></div>
          </Reveal>)}
        </div>
      </section>

      <section id="resenas" className="rt-rev" aria-labelledby="rt-rev-title">
        <Reveal className="rt-head">
          <h2 id="rt-rev-title" className="rt-title">Papás contentos</h2>
        </Reveal>
        <div className="rt-rev__grid">
          {reviews.map((rev, index) => <Reveal key={rev.who} delay={index * 60}>
            <figure className="rt-rev__item"><blockquote>{rev.quote}</blockquote><figcaption>{rev.who}</figcaption></figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="rt-news" aria-labelledby="rt-news-title" data-pagosya-subscribe-block>
        <Reveal className="rt-news__inner">
          <h2 id="rt-news-title" className="rt-news__title">Novedades y ofertas</h2>
          <p className="rt-news__text">Colecciones nuevas y descuentos, en tu correo.</p>
          <button type="button" className="rt-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="rt-news__field">Tu correo electrónico</span>
            <span className="rt-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="rt-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
