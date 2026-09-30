import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const categories = ['Camisetas', 'Gorras', 'Calzado', 'Accesorios', 'Entrenamiento'];

const kits = [
  { name: 'Local', text: 'La camiseta del partido en casa, tela que respira y escudo bordado.', tone: 'violet' },
  { name: 'Visitante', text: 'Para jugar de afuera: lima intenso, corte atlético.', tone: 'lime' },
  { name: 'Práctica', text: 'Ligera, con secado rápido para las sesiones de cada semana.', tone: 'deep' },
];

const drills = [
  { n: '01', title: 'Calentamiento', text: 'Diez minutos de movilidad antes de tocar el balón.' },
  { n: '02', title: 'Técnica', text: 'Pases cortos, control y giros en espacios reducidos.' },
  { n: '03', title: 'Partido', text: 'Seis contra seis con reglas simples y cambios rápidos.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="ar-hero" aria-labelledby="ar-hero-title">
        <div className="ar-hero__copy">
          <p className="ar-kicker">Temporada nueva</p>
          <h1 id="ar-hero-title" className="ar-hero__title">{store.name}</h1>
          <p className="ar-hero__lead">Camisetas, gorras y calzado para los que viven el deporte.</p>
          <a className="ar-btn" href="#novedades">Comprar ahora</a>
        </div>
        <div className="ar-hero__art">
          <Parallax strength={50} mobileStrength={20} className="ar-hero__athlete"><img src={photos.p1} alt="Corredor en plena carrera con ropa deportiva sobre fondo violeta" /></Parallax>
          <img className="ar-hero__inset" src={photos.p2} alt="Gorra deportiva morada sobre fondo liso" />
        </div>
      </section>

      <section id="categorias" className="ar-cats" aria-label="Categorías">
        <ul className="ar-cats__list">
          {categories.map(cat => <li key={cat}><a href="#novedades">{cat}</a></li>)}
        </ul>
      </section>

      <section id="novedades" className="ar-shop" aria-labelledby="ar-shop-title">
        <Reveal className="ar-head">
          <h2 id="ar-shop-title" className="ar-title">Novedades</h2>
          <p className="ar-head__aside">Lo último que llegó al vestuario.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ar-card">
            <a className="ar-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="ar-card__name" data-product-field="name">Producto</h3>
            <p className="ar-card__price" data-product-field="price" />
            <button type="button" className="ar-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ar-grid" data-pagosya-catalog />
      </section>

      <section id="equipo" className="ar-kits" aria-labelledby="ar-kits-title">
        <Reveal className="ar-head">
          <h2 id="ar-kits-title" className="ar-title">Equipo completo</h2>
          <p className="ar-head__aside">Tres camisetas para cada momento del campeonato.</p>
        </Reveal>
        <div className="ar-kits__grid">
          {kits.map((kit, index) => <Reveal key={kit.name} delay={index * 60}>
            <a className={`ar-kit ar-kit--${kit.tone}`} href="#novedades">
              <span className="ar-kit__name">{kit.name}</span>
              <span className="ar-kit__text">{kit.text}</span>
              <span className="ar-kit__go">Ver más →</span>
            </a>
          </Reveal>)}
        </div>
        <div className="ar-kits__row">
          <img src={photos.p3} alt="Camiseta deportiva violeta doblada sobre fondo liso" />
          <img src={photos.p4} alt="Zapatillas deportivas con detalles lima sobre fondo liso" />
        </div>
      </section>

      <section id="entrenamiento" className="ar-train" aria-labelledby="ar-train-title">
        <div className="ar-train__photo">
          <Parallax strength={50} mobileStrength={20} className="ar-drift"><img src={photos.cancha} alt="Cancha de fútbol al atardecer con las líneas marcadas" /></Parallax>
        </div>
        <Reveal className="ar-train__copy">
          <p className="ar-kicker">Entrenamiento</p>
          <h2 id="ar-train-title" className="ar-title">Sesiones para todos los niveles</h2>
          <ol className="ar-train__list">
            {drills.map(drill => <li key={drill.n}>
              <span className="ar-train__n">{drill.n}</span>
              <span><b>{drill.title}</b><br />{drill.text}</span>
            </li>)}
          </ol>
          <a className="ar-btn ar-btn--lime" href="#novedades">Equiparme</a>
        </Reveal>
      </section>

      <section id="ofertas" className="ar-offer" aria-labelledby="ar-offer-title">
        <Reveal className="ar-offer__inner">
          <h2 id="ar-offer-title" className="ar-offer__title">Ofertas de temporada</h2>
          <p className="ar-offer__text">Elige tu equipo y aprovecha los descuentos de cierre de campeonato.</p>
          <a className="ar-btn ar-btn--deep" href="#novedades">Ver ofertas</a>
        </Reveal>
        <img className="ar-offer__crowd" src={photos.hinchada} alt="Hinchada en las gradas con banderas y bufandas moradas" />
      </section>

      <section id="boletin" className="ar-news" aria-labelledby="ar-news-title" data-pagosya-subscribe-block>
        <Reveal className="ar-news__inner">
          <h2 id="ar-news-title" className="ar-news__title">Únete al equipo</h2>
          <p className="ar-news__text">Lanzamientos, ofertas y fechas de entrenamiento en tu correo.</p>
          <button type="button" className="ar-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="ar-news__field">Tu correo electrónico</span>
            <span className="ar-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="ar-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
