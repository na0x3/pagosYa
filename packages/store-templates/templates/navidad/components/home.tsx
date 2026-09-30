import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { photos } from './store-data';

const rooms = [
  { name: 'Sala', text: 'Árbol, luces cálidas y medias en la chimenea.', photo: 'p1' as const, alt: 'Mujer colgando un adorno rojo en un árbol de pino en una sala con luces cálidas' },
  { name: 'Mesa', text: 'Centro de mesa con pino y detalles dorados.', photo: 'mesa' as const, alt: 'Mesa de cena navideña con ramas de pino y detalles dorados' },
  { name: 'Puerta', text: 'Una corona que da la bienvenida a tus invitados.', photo: 'puerta' as const, alt: 'Corona navideña colgada en una puerta de madera' },
];

const steps = [
  { date: '10 dic', title: 'Haz tu pedido', text: 'Elige tus adornos y paga con QR o tarjeta.' },
  { date: '13 dic', title: 'Lo preparamos', text: 'Empacamos cada pieza con cuidado.' },
  { date: '20 dic', title: 'Llega a tu casa', text: 'A tiempo para armar todo antes del 24.' },
];

const reviews = [
  { quote: 'Los adornos llegaron perfectos y la casa quedó preciosa.', who: 'Andrea, La Paz' },
  { quote: 'La corona es más bonita en persona. Volveré el próximo año.', who: 'Jorge, Sucre' },
  { quote: 'El empaque es tan lindo que casi no quise abrirlo.', who: 'Natalia, Santa Cruz' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="na-hero" aria-labelledby="na-hero-title">
        <Parallax strength={50} mobileStrength={20} className="na-hero__bg"><img src={photos.p1} alt="Mujer colgando un adorno rojo en un árbol de pino en una sala tenue con luces cálidas" /></Parallax>
        <div className="na-hero__copy">
          <p className="na-hero__caption">Tu tienda de todo lo navideño</p>
          <h1 id="na-hero-title" className="na-hero__title">Ofertas de temporada</h1>
          <a className="na-btn" href="#adornos">Comprar ahora</a>
        </div>
        <div className="na-hero__cards">
          <a className="na-hero__card" href="#adornos"><img src={photos.p2} alt="Adorno de vidrio rosa sobre fondo blanco" /></a>
          <a className="na-hero__card" href="#adornos"><img src={photos.p3} alt="Árbol de fieltro en miniatura sobre fondo blanco" /></a>
          <a className="na-hero__card" href="#adornos"><img src={photos.p4} alt="Velas rojas de cera de abeja sobre fondo blanco" /></a>
        </div>
      </section>

      <section id="adornos" className="na-shop" aria-labelledby="na-shop-title">
        <Reveal className="na-head">
          <h2 id="na-shop-title" className="na-title">Adornos</h2>
          <p className="na-head__aside">Piezas para armar la Navidad de tu casa.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="na-card">
            <a className="na-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="na-card__name" data-product-field="name">Producto</h3>
            <p className="na-card__price" data-product-field="price" />
            <button type="button" className="na-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="na-grid" data-pagosya-catalog />
      </section>

      <section id="ambientes" className="na-rooms" aria-labelledby="na-rooms-title">
        <Reveal className="na-head">
          <h2 id="na-rooms-title" className="na-title">Por ambiente</h2>
        </Reveal>
        <div className="na-rooms__grid">
          {rooms.map((room, index) => <Reveal key={room.name} delay={index * 60}>
            <a className="na-room" href="#adornos">
              <img src={photos[room.photo]} alt={room.alt} />
              <span><b>{room.name}</b>{room.text}</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="regalos" className="na-gifts" aria-labelledby="na-gifts-title">
        <Reveal className="na-gifts__inner">
          <h2 id="na-gifts-title" className="na-gifts__title">Sets de regalo</h2>
          <p className="na-gifts__text">Combinaciones listas para regalar: velas, adornos y una tarjeta escrita a mano. Encuéntralos en el catálogo con su precio.</p>
          <a className="na-btn na-btn--gold" href="#adornos">Ver los sets</a>
        </Reveal>
      </section>

      <section id="envios" className="na-ship" aria-labelledby="na-ship-title">
        <Reveal className="na-head">
          <h2 id="na-ship-title" className="na-title">Llega antes del 24 de diciembre</h2>
        </Reveal>
        <ol className="na-ship__list">
          {steps.map((step, index) => <li key={step.date}>
            <Reveal delay={index * 60}>
              <span className="na-ship__date">{step.date}</span>
              <b>{step.title}</b>
              <span>{step.text}</span>
            </Reveal>
          </li>)}
        </ol>
      </section>

      <section id="resenas" className="na-rev" aria-labelledby="na-rev-title">
        <Reveal className="na-head">
          <h2 id="na-rev-title" className="na-title">Familias felices</h2>
        </Reveal>
        <div className="na-rev__grid">
          {reviews.map((rev, index) => <Reveal key={rev.who} delay={index * 60}>
            <figure className="na-rev__item"><blockquote>{rev.quote}</blockquote><figcaption>{rev.who}</figcaption></figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="na-news" aria-labelledby="na-news-title" data-pagosya-subscribe-block>
        <Reveal className="na-news__inner">
          <h2 id="na-news-title" className="na-news__title">Ofertas antes que nadie</h2>
          <p className="na-news__text">Novedades y descuentos de temporada, en tu correo.</p>
          <button type="button" className="na-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="na-news__field">Tu correo electrónico</span>
            <span className="na-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="na-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
