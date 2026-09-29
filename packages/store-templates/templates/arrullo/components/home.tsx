import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { photos } from './store-data';

const budgets = [
  { name: 'Hasta Bs 150', text: 'Sonajeros, mordedores y tarjetas de bienvenida.' },
  { name: 'Bs 150 a 300', text: 'Mantas tejidas, peluches y sets de baño.' },
  { name: 'Más de Bs 300', text: 'Cunas móviles, canastas completas y cajas de regalo.' },
];

const checklist = ['Una cuna firme y sin adornos sueltos', 'Mantas de algodón para cada estación', 'Luz cálida y tenue para la noche', 'Un rincón suave para leer juntos'];

const promises = [
  { name: 'Materiales seguros', text: 'Algodón y lana sin tintes agresivos.' },
  { name: 'Tejido a mano', text: 'Cada pieza pasa por manos artesanas.' },
  { name: 'Empaque reutilizable', text: 'Bolsas de tela que se vuelven útiles.' },
];

const reviews = [
  { quote: 'La manta es suave y el empaque parecía un regalo desde antes de abrirlo.', who: 'Valeria, La Paz' },
  { quote: 'Lo elegí para mi sobrina y llegó impecable, con tarjeta incluida.', who: 'Marcela, Sucre' },
  { quote: 'El conejito no se separa de mi bebé.', who: 'Diego, Santa Cruz' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="au-hero" aria-labelledby="au-hero-title">
        <h1 id="au-hero-title" className="au-sr">Regalos para bebé</h1>
        <div className="au-hero__halves">
          <img src={photos.p1} alt="Rincón de un cuarto de bebé con un dosel de lino y un móvil de fieltro" />
          <img src={photos.p2} alt="Nubes de fieltro y una luna creciente sobre fondo neutro" />
        </div>
        <div className="au-hero__caption">
          <p>Suavidad para los primeros días</p>
          <a className="au-btn" href="#regalos">Ver regalos</a>
        </div>
      </section>

      <section id="regalos" className="au-shop" aria-labelledby="au-shop-title">
        <Reveal className="au-head">
          <h2 id="au-shop-title" className="au-title">Regalos para bebé</h2>
          <p className="au-head__aside">Piezas suaves, hechas para durar.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="au-card">
            <a className="au-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="au-card__name" data-product-field="name">Producto</h3>
            <p className="au-card__price" data-product-field="price" />
            <button type="button" className="au-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="au-grid" data-pagosya-catalog />
      </section>

      <section id="guia" className="au-guide" aria-labelledby="au-guide-title">
        <Reveal className="au-head">
          <h2 id="au-guide-title" className="au-title">Guía por presupuesto</h2>
        </Reveal>
        <div className="au-guide__grid">
          {budgets.map((item, index) => <Reveal key={item.name} delay={index * 60}>
            <a className="au-guide__tile" href="#regalos"><b>{item.name}</b><span>{item.text}</span></a>
          </Reveal>)}
        </div>
      </section>

      <section id="cuarto" className="au-room" aria-labelledby="au-room-title">
        <div className="au-room__frame">
          <Parallax strength={40} mobileStrength={20} className="au-drift"><img src={photos.cuarto} alt="Cuarto de bebé luminoso y neutro con una cuna de madera" /></Parallax>
        </div>
        <Reveal className="au-room__copy">
          <h2 id="au-room-title" className="au-title">El cuarto, paso a paso</h2>
          <ul className="au-room__list">{checklist.map(item => <li key={item}>{item}</li>)}</ul>
          <a className="au-btn au-btn--ghost" href="#regalos">Ver para el cuarto</a>
        </Reveal>
      </section>

      <section id="filosofia" className="au-phil" aria-labelledby="au-phil-title">
        <Reveal className="au-head">
          <h2 id="au-phil-title" className="au-title">Nuestras promesas</h2>
        </Reveal>
        <div className="au-phil__grid">
          {promises.map((item, index) => <Reveal key={item.name} delay={index * 60}>
            <div className="au-phil__item"><b>{item.name}</b><span>{item.text}</span></div>
          </Reveal>)}
          <img className="au-phil__photo" src={photos.manos} alt="Manos de un adulto sosteniendo la mano de un bebé" />
        </div>
      </section>

      <section id="resenas" className="au-rev" aria-labelledby="au-rev-title">
        <Reveal className="au-head">
          <h2 id="au-rev-title" className="au-title">Familias felices</h2>
        </Reveal>
        <div className="au-rev__grid">
          {reviews.map((rev, index) => <Reveal key={rev.who} delay={index * 60}>
            <figure className="au-rev__item"><blockquote>{rev.quote}</blockquote><figcaption>{rev.who}</figcaption></figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="au-news" aria-labelledby="au-news-title" data-pagosya-subscribe-block>
        <Reveal className="au-news__inner">
          <h2 id="au-news-title" className="au-news__title">Ideas suaves, en tu correo</h2>
          <p className="au-news__text">Guías de regalos y novedades, una vez al mes.</p>
          <button type="button" className="au-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="au-news__field">Tu correo electrónico</span>
            <span className="au-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="au-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
