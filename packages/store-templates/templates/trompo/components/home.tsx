import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const hero = [
  { slot: 'p1', tone: 'teal', age: '1–2 años', name: 'Conejo Saltarín', alt: 'Conejo de madera pintado sobre fondo verde azulado' },
  { slot: 'p2', tone: 'cobalt', age: '0–1 año', name: 'Muñeca Nido', alt: 'Muñeca rusa de madera sobre fondo azul' },
  { slot: 'p3', tone: 'orange', age: '2–3 años', name: 'Figura de Clavijas', alt: 'Figura de clavijas y un bloque negro sobre fondo naranja' },
];

const ages = [
  { range: '0–1', label: 'años', note: 'Para agarrar y morder', tone: 'blush' },
  { range: '1–2', label: 'años', note: 'Para apilar y encajar', tone: 'sky' },
  { range: '3–5', label: 'años', note: 'Para imaginar y armar', tone: 'lemon' },
  { range: '6+', label: 'años', note: 'Para pensar y construir', tone: 'mint' },
];

const promises = [
  { title: 'Sin tóxicos', text: 'Pintura al agua y barniz de cera, aptos para la boca de un bebé.' },
  { title: 'Sin piezas pequeñas', text: 'Todo se diseña más grande que un rollo de papel higiénico.' },
  { title: 'Lijado a mano', text: 'Cada juguete pasa por unas manos antes de llegar a las tuyas.' },
];

const reviews = [
  { quote: 'Mi hija de un año no suelta el conejo. Es liviano y no tiene ni una astilla.', name: 'Paola', city: 'Cochabamba' },
  { quote: 'Lo regalamos en un cumpleaños y todos los papás preguntaron dónde comprarlo.', name: 'Fernando', city: 'Tarija' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="tr-hero" aria-labelledby="tr-hero-title">
        <h1 id="tr-hero-title" className="tr-hero__name">{store.name}</h1>
        <p className="tr-hero__lead">Juguetes de madera para cada edad, hechos para jugar de verdad.</p>
        <div className="tr-hero__cards">
          {hero.map((card, index) => <Reveal key={card.slot} delay={index * 70}>
            <a className={`tr-block tr-block--${card.tone}`} href="#juguetes">
              <span className="tr-block__age">{card.age}</span>
              <img src={photos[card.slot]} alt={card.alt} />
              <span className="tr-block__row"><span className="tr-block__name">{card.name}</span><span className="tr-block__go" aria-hidden="true">→</span></span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="edades" className="tr-ages" aria-labelledby="tr-ages-title">
        <Reveal className="tr-head">
          <h2 id="tr-ages-title" className="tr-title">¿Para quién es?</h2>
          <p className="tr-head__aside">Elige por edad y acertarás: cada juguete se prueba con niños de esa edad.</p>
        </Reveal>
        <div className="tr-ages__grid">
          {ages.map((age, index) => <Reveal key={age.range} delay={index * 60}>
            <a className={`tr-age tr-age--${age.tone}`} href="#juguetes">
              <span className="tr-age__range">{age.range}</span>
              <span className="tr-age__label">{age.label}</span>
              <span className="tr-age__note">{age.note}</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="juguetes" className="tr-shop" aria-labelledby="tr-shop-title">
        <Reveal className="tr-head">
          <h2 id="tr-shop-title" className="tr-title">Todos los juguetes</h2>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="tr-card">
            <a className="tr-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del juguete" /></a>
            <h3 className="tr-card__name" data-product-field="name">Juguete</h3>
            <p className="tr-card__price" data-product-field="price" />
            <button type="button" className="tr-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="tr-grid" data-pagosya-catalog />
      </section>

      <section id="madera" className="tr-wood" aria-labelledby="tr-wood-title">
        <div className="tr-wood__photo">
          <Parallax strength={70} mobileStrength={24} className="tr-drift"><img src={photos.taller} alt="Artesano lijando un juguete de madera en un taller luminoso" /></Parallax>
        </div>
        <Reveal className="tr-wood__copy">
          <p className="tr-kicker">Del taller a tu casa</p>
          <h2 id="tr-wood-title" className="tr-title">Madera de la Chiquitania, pintura sin tóxicos</h2>
          <p>Cortamos, lijamos y pintamos cada pieza en nuestro taller. Usamos madera de manejo forestal y colores al agua que puedes chupar sin miedo.</p>
          <a className="tr-btn" href="#juguetes">Ver los juguetes</a>
        </Reveal>
      </section>

      <section id="seguridad" className="tr-safe" aria-labelledby="tr-safe-title">
        <Reveal className="tr-head">
          <h2 id="tr-safe-title" className="tr-title">Pensados para jugar tranquilo</h2>
        </Reveal>
        <ul className="tr-safe__list">
          {promises.map((item, index) => <li key={item.title}>
            <Reveal delay={index * 60}>
              <span className="tr-safe__badge" aria-hidden="true">{index + 1}</span>
              <b className="tr-safe__title">{item.title}</b>
              <span className="tr-safe__text">{item.text}</span>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="regalos" className="tr-gift" aria-labelledby="tr-gift-title">
        <Reveal className="tr-gift__inner">
          <img className="tr-gift__photo" src={photos.juego} alt="Un niño pequeño jugando con juguetes de madera sobre una alfombra" />
          <div className="tr-gift__copy">
            <h2 id="tr-gift-title" className="tr-title">¿Buscas un regalo?</h2>
            <p>Dinos la edad y el presupuesto. Te armamos un set con envoltura de tela y una tarjeta escrita a mano.</p>
            <a className="tr-btn tr-btn--dark" href="#juguetes">Elegir un regalo</a>
          </div>
        </Reveal>
      </section>

      <section id="resenas" className="tr-reviews" aria-labelledby="tr-reviews-title">
        <Reveal className="tr-head">
          <h2 id="tr-reviews-title" className="tr-title">Papás contentos</h2>
        </Reveal>
        <div className="tr-quotes">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
            <figure className="tr-quote">
              <blockquote>{review.quote}</blockquote>
              <figcaption><b>{review.name}</b> · {review.city}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="tr-news" aria-labelledby="tr-news-title" data-pagosya-subscribe-block>
        <Reveal className="tr-news__inner">
          <h2 id="tr-news-title" className="tr-news__title">Juguetes nuevos, primero para ti</h2>
          <p className="tr-news__text">Te avisamos cuando salgan tiradas nuevas. Sin llenar tu bandeja.</p>
          <button type="button" className="tr-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="tr-news__field">Tu correo electrónico</span>
            <span className="tr-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="tr-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
