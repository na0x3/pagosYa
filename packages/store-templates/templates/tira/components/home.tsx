import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const genres = [
  { name: 'Manga', note: 'De derecha a izquierda', tone: 'blue' },
  { name: 'Superhéroes', note: 'Capas y ciudades', tone: 'yellow' },
  { name: 'Novela gráfica', note: 'Historias largas', tone: 'lime' },
  { name: 'Infantil', note: 'Para los primeros lectores', tone: 'pink' },
];

const picks = [
  { title: 'El que no puedo dejar', note: '“Lo empecé un viernes y terminé el domingo. Buenísimo el dibujo.”', who: 'Nota de Camila' },
  { title: 'Para regalar sin miedo', note: '“Le gusta a grandes y chicos. Es de esos que se prestan y vuelven.”', who: 'Nota de Diego' },
  { title: 'El más bonito del estante', note: '“Las páginas a color valen cada centavo. Te quedas mirando.”', who: 'Nota de Lía' },
];

const reviews = [
  { quote: 'Llegó en su funda y con una tarjeta escrita a mano. Así da gusto comprar cómics.', name: 'Bruno', city: 'Santa Cruz' },
  { quote: 'Me recomendaron un manga que no conocía y ahora quiero toda la serie.', name: 'Valentina', city: 'La Paz' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="ti-hero" aria-labelledby="ti-hero-title">
        <div className="ti-hero__photo"><img src={photos.p1} alt="Mujer leyendo un cómic ilustrado sentada en una banca roja frente a un muro de graffiti" /></div>
        <div className="ti-hero__collage">
          <img className="ti-hero__roll" src={photos.p2} alt="Un póster enrollado con estampado azul y verde ácido" />
          <span className="ti-hero__sticker" aria-hidden="true">Nuevo</span>
        </div>
        <div className="ti-hero__band">
          <h1 id="ti-hero-title" className="ti-hero__title">Cada página se convierte en algo</h1>
          <a className="ti-btn" href="#estantes">Ver todos los cómics</a>
        </div>
      </section>

      <section id="estantes" className="ti-shop" aria-labelledby="ti-shop-title">
        <Reveal className="ti-head">
          <h2 id="ti-shop-title" className="ti-title">En los estantes</h2>
          <p className="ti-head__aside">Tomos nuevos cada semana de {store.name}. Elige uno y lee.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ti-card">
            <a className="ti-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Portada del tomo" /></a>
            <h3 className="ti-card__name" data-product-field="name">Tomo</h3>
            <p className="ti-card__price" data-product-field="price" />
            <button type="button" className="ti-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ti-grid" data-pagosya-catalog />
      </section>

      <section id="generos" className="ti-genres" aria-labelledby="ti-genres-title">
        <Reveal className="ti-head">
          <h2 id="ti-genres-title" className="ti-title">Elige tu género</h2>
        </Reveal>
        <div className="ti-genres__grid">
          {genres.map((genre, index) => <Reveal key={genre.name} delay={index * 60}>
            <a className={`ti-genre ti-genre--${genre.tone}`} href="#estantes">
              <span className="ti-genre__name">{genre.name}</span>
              <span className="ti-genre__note">{genre.note}</span>
            </a>
          </Reveal>)}
        </div>
      </section>

      <section id="lectura" className="ti-club" aria-labelledby="ti-club-title">
        <div className="ti-club__photo">
          <Parallax strength={60} mobileStrength={22} className="ti-drift"><img src={photos.club} alt="Cinco amigos alrededor de una mesa con cómics y bebidas" /></Parallax>
        </div>
        <Reveal className="ti-club__copy">
          <p className="ti-kicker">Club de lectura</p>
          <h2 id="ti-club-title" className="ti-title">Un tomo al mes, con amigos</h2>
          <p>Cada primer sábado nos juntamos a leer, cambiar cómics y discutir finales. Entra gratis: solo trae uno para prestar.</p>
          <a className="ti-btn ti-btn--dark" href="#estantes">Quiero unirme</a>
        </Reveal>
      </section>

      <section id="recomendados" className="ti-picks" aria-labelledby="ti-picks-title">
        <Reveal className="ti-head">
          <h2 id="ti-picks-title" className="ti-title">Recomendados del equipo</h2>
          <p className="ti-head__aside">Con la letra de quien los leyó.</p>
        </Reveal>
        <div className="ti-picks__grid">
          {picks.map((pick, index) => <Reveal key={pick.title} delay={index * 60}>
            <article className="ti-pick">
              <h3 className="ti-pick__title">{pick.title}</h3>
              <p className="ti-pick__note">{pick.note}</p>
              <p className="ti-pick__who">{pick.who}</p>
            </article>
          </Reveal>)}
        </div>
      </section>

      <section id="resenas" className="ti-reviews" aria-labelledby="ti-reviews-title">
        <Reveal className="ti-head">
          <h2 id="ti-reviews-title" className="ti-title">Lectores felices</h2>
        </Reveal>
        <div className="ti-reviews__grid">
          <figure className="ti-reviews__photo"><img src={photos.tienda} alt="Pasillo estrecho de una tienda de cómics lleno de lomos de colores" /></figure>
          <div className="ti-quotes">
            {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
              <figure className="ti-quote">
                <blockquote>{review.quote}</blockquote>
                <figcaption><b>{review.name}</b> · {review.city}</figcaption>
              </figure>
            </Reveal>)}
          </div>
        </div>
      </section>

      <section id="boletin" className="ti-news" aria-labelledby="ti-news-title" data-pagosya-subscribe-block>
        <Reveal className="ti-news__inner">
          <h2 id="ti-news-title" className="ti-news__title">Tomos nuevos, primero para ti</h2>
          <p className="ti-news__text">Te avisamos cuando llegan novedades. Nada de spam.</p>
          <button type="button" className="ti-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="ti-news__field">Tu correo electrónico</span>
            <span className="ti-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="ti-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
