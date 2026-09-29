import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const panels = [
  { slot: 'tienda', tag: 'Página 1', text: 'Todo empezó con una caja de cómics heredada y un local de tres metros.', alt: 'Dueño de la tienda con una pila de cómics entre estantes de colores' },
  { slot: 'lectura', tag: 'Página 2', text: 'Hoy hay lectores de todas las edades sentados en el piso, sin querer irse.', alt: 'Mujer sentada en el piso de un pasillo leyendo un cómic' },
  { slot: 'p2', tag: 'Página 3', text: 'Y cada semana llegan historias nuevas que ya esperan en el estante.', alt: 'Portada ilustrada de un robot gigante entre flores' },
];

const series = [
  { name: 'Superhéroes', note: 'Capas, máscaras y ciudades en peligro', tone: 'hero' },
  { name: 'Aventura', note: 'Mapas, cohetes y mundos por descubrir', tone: 'adv' },
  { name: 'Humor', note: 'Tiras para reírse en el micro', tone: 'fun' },
  { name: 'Clásicos', note: 'Ediciones que ya son leyenda', tone: 'old' },
];

const voices = [
  { quote: 'Vine por un cómic y me fui con cinco. El dueño se acuerda de lo que le gusta a cada uno.', name: 'Sebastián', city: 'La Paz' },
  { quote: 'Le regalé una edición de colección a mi papá y casi llora. Llegó impecable y bien protegida.', name: 'Lucía', city: 'Santa Cruz' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="hi-hero" aria-labelledby="hi-hero-title">
        <div className="hi-hero__art">
          <div className="hi-hero__cover"><img src={photos.p1} alt="Portada ilustrada de un héroe enmascarado saltando sobre una ciudad al atardecer" /></div>
        </div>
        <Reveal className="hi-bubble">
          <p className="hi-kicker">Cómics y coleccionables</p>
          <h1 id="hi-hero-title" className="hi-hero__title">El hombre detrás de los cómics</h1>
          <p className="hi-bubble__text">En {store.name} cada cómic se elige a mano, se guarda en su funda y llega a tu casa listo para leer. Historias de aquí, de allá y de otro planeta.</p>
          <a className="hi-btn" href="#novedades">Comprar ahora <span aria-hidden="true">↗</span></a>
        </Reveal>
      </section>

      <section id="novedades" className="hi-shop" aria-labelledby="hi-shop-title">
        <Reveal className="hi-head">
          <h2 id="hi-shop-title" className="hi-title">Recién llegados</h2>
          <p className="hi-head__aside">Portadas nuevas cada semana. Si ves una que te gusta, no la dejes ir.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="hi-card">
            <a className="hi-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Portada del cómic" /></a>
            <h3 className="hi-card__name" data-product-field="name">Cómic</h3>
            <p className="hi-card__price" data-product-field="price" />
            <button type="button" className="hi-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="hi-grid" data-pagosya-catalog />
      </section>

      <section id="historia" className="hi-story" aria-labelledby="hi-story-title">
        <Reveal className="hi-head">
          <h2 id="hi-story-title" className="hi-title">Nuestra historia en tres viñetas</h2>
        </Reveal>
        <div className="hi-panels">
          {panels.map((panel, index) => <Reveal key={panel.slot} delay={index * 60}>
            <figure className="hi-panel">
              <img src={photos[panel.slot]} alt={panel.alt} />
              <figcaption><b>{panel.tag}</b>{panel.text}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="series" className="hi-series" aria-labelledby="hi-series-title">
        <Reveal className="hi-head">
          <h2 id="hi-series-title" className="hi-title">Elige tu género</h2>
        </Reveal>
        <div className="hi-series__grid">
          {series.map((item, index) => <Reveal key={item.name} delay={index * 60}>
            <a className={`hi-genre hi-genre--${item.tone}`} href="#novedades">
              <span className="hi-genre__name">{item.name}</span>
              <span className="hi-genre__note">{item.note}</span>
              <span className="hi-genre__go" aria-hidden="true">→</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="coleccion" className="hi-feature" aria-labelledby="hi-feature-title">
        <Parallax strength={70} mobileStrength={24} className="hi-drift"><img src={photos.p3} alt="Portada ilustrada de un cohete despegando sobre un planeta rojo" /></Parallax>
        <Reveal className="hi-feature__copy">
          <span className="hi-badge">Edición limitada</span>
          <h2 id="hi-feature-title" className="hi-title">Para coleccionistas</h2>
          <p>Ediciones numeradas, en funda y con certificado. Cada mes separamos una para quien la busca de verdad.</p>
          <a className="hi-btn hi-btn--dark" href="#novedades">Ver la colección</a>
        </Reveal>
      </section>

      <section id="voces" className="hi-voices" aria-labelledby="hi-voices-title">
        <Reveal className="hi-head">
          <h2 id="hi-voices-title" className="hi-title">Lo que dicen los lectores</h2>
        </Reveal>
        <div className="hi-voices__grid">
          {voices.map((voice, index) => <Reveal key={voice.name} delay={index * 60}>
            <figure className="hi-say">
              <blockquote>{voice.quote}</blockquote>
              <figcaption><b>{voice.name}</b> · {voice.city}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="suscripcion" className="hi-news" aria-labelledby="hi-news-title" data-pagosya-subscribe-block>
        <Reveal className="hi-news__inner">
          <h2 id="hi-news-title" className="hi-news__title">Un cómic nuevo cada mes</h2>
          <p className="hi-news__text">Déjanos tu correo y te avisamos primero cuando llegue una edición nueva.</p>
          <button type="button" className="hi-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="hi-news__field">Tu correo electrónico</span>
            <span className="hi-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="hi-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
