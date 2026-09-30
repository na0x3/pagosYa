import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const floating = [
  { slot: 'p1', className: 'af-float af-float--a', alt: 'Jarrón de barro negro sobre fondo blanco' },
  { slot: 'p2', className: 'af-float af-float--b', alt: 'Taza cerámica moteada' },
  { slot: 'p3', className: 'af-float af-float--c', alt: 'Cuenco ancho color ocre' },
  { slot: 'p4', className: 'af-float af-float--d', alt: 'Jarra pequeña de barro marrón' },
];

const steps = [
  { n: '01', title: 'Barro', text: 'Amasamos arcilla local hasta que no tenga aire.' },
  { n: '02', title: 'Torno', text: 'Cada pieza nace entre las manos, con el torno girando.' },
  { n: '03', title: 'Esmalte', text: 'Esmaltes propios, hechos con ceniza y minerales.' },
  { n: '04', title: 'Horno', text: 'Un fuego lento de doce horas que las hace resistentes.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="af-hero" aria-labelledby="af-hero-title">
        <div className="af-hero__stage">
          <span className="af-hero__blob" aria-hidden="true" />
          <div className="af-hero__copy">
            <h1 id="af-hero-title" className="af-hero__title">Hecha con cuidado</h1>
            <p className="af-hero__lead">Explora un mundo de cerámica hecha a mano en {store.name}.</p>
            <a className="af-link" href="#piezas">Comprar ahora</a>
          </div>
          {floating.map(item => <img key={item.slot} className={item.className} src={photos[item.slot]} alt={item.alt} />)}
        </div>
        <p className="af-hero__foot">Cada pieza es un testimonio del oficio.</p>
      </section>

      <section id="piezas" className="af-shop" aria-labelledby="af-shop-title">
        <Reveal className="af-head">
          <h2 id="af-shop-title" className="af-title">Piezas del taller</h2>
          <p className="af-head__aside">Tazas, cuencos y jarras para usar todos los días.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="af-card">
            <a className="af-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la pieza" /></a>
            <h3 className="af-card__name" data-product-field="name">Pieza</h3>
            <p className="af-card__price" data-product-field="price" />
            <button type="button" className="af-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="af-grid" data-pagosya-catalog />
      </section>

      <section id="proceso" className="af-process" aria-labelledby="af-process-title">
        <Reveal className="af-head">
          <h2 id="af-process-title" className="af-title">De la tierra a tu mesa</h2>
        </Reveal>
        <ol className="af-steps">
          {steps.map((step, index) => <li key={step.n}>
            <Reveal delay={index * 60}>
              <span className="af-steps__n">{step.n}</span>
              <b className="af-steps__title">{step.title}</b>
              <span className="af-steps__text">{step.text}</span>
            </Reveal>
          </li>)}
        </ol>
      </section>

      <section id="coleccion" className="af-collection" aria-label="Colección">
        <Parallax strength={70} mobileStrength={24} className="af-drift"><img src={photos.mesa} alt="Mesa puesta con platos y tazas de cerámica hecha a mano sobre un mantel de lino" /></Parallax>
        <Reveal className="af-collection__cap"><p>Mesa de domingo · colección Barro Claro</p></Reveal>
      </section>

      <section id="taller" className="af-workshop" aria-labelledby="af-workshop-title">
        <div className="af-workshop__photo"><img src={photos.taller} alt="Alfarera dando forma a un cuenco en el torno con las manos mojadas" /></div>
        <Reveal className="af-workshop__copy">
          <p className="af-kicker">El taller</p>
          <h2 id="af-workshop-title" className="af-title">Manos con barro, todos los días</h2>
          <p>Somos tres en el taller. Trabajamos con arcilla de la zona y esmaltes que probamos durante meses. Lo que no sale bien, se rompe y vuelve a la tierra.</p>
        </Reveal>
      </section>

      <section id="pedidos" className="af-custom" aria-labelledby="af-custom-title">
        <Reveal className="af-custom__inner">
          <h2 id="af-custom-title" className="af-custom__title">Pedidos a medida</h2>
          <p className="af-custom__text">Juegos de mesa para un restaurante, tazas para un regalo o una vajilla completa. Cuéntanos qué necesitas y te respondemos con un plan.</p>
          <a className="af-link af-link--light" href="#piezas">Ver piezas de ejemplo</a>
        </Reveal>
      </section>

      <section id="boletin" className="af-news" aria-labelledby="af-news-title" data-pagosya-subscribe-block>
        <Reveal className="af-news__inner">
          <h2 id="af-news-title" className="af-news__title">Cuando abre el horno</h2>
          <p className="af-news__text">Te avisamos de cada tanda nueva, para que llegues antes de que se agote.</p>
          <button type="button" className="af-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="af-news__field">Tu correo electrónico</span>
            <span className="af-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="af-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
