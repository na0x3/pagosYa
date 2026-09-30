import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const materials = [
  { title: 'Plata 925', text: 'Plata de ley con sello. No se oscurece con el uso diario si la guardas bien.' },
  { title: 'Cuentas de vidrio', text: 'Cuentas hechas a mano en pequeños lotes, con colores que no se repiten.' },
  { title: 'Empaque de regalo', text: 'Cada pieza sale en su bolsita de tela y una cajita reutilizable.' },
];

const care = [
  { q: 'Cómo guardar tus joyas', a: 'Guárdalas por separado, en su bolsita de tela y lejos de la humedad del baño. Así la plata dura años sin oscurecerse.' },
  { q: 'Cómo limpiarlas', a: 'Frota suavemente con un paño seco de algodón. Si hace falta, agua tibia con una gota de jabón neutro y seca enseguida.' },
  { q: 'Qué evitar', a: 'Quítate las joyas para nadar, cocinar con lejía o aplicarte perfume. Los químicos opacan la plata y las cuentas.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="pl-hero" aria-labelledby="pl-hero-title">
        <div className="pl-hero__left">
          <img src={photos.p1} alt="Retrato en blanco y negro de una mujer de perfil con un arete de plata escultural" />
          <h1 id="pl-hero-title" className="pl-hero__title">Hecho a la medida de ti</h1>
        </div>
        <div className="pl-hero__right">
          <img src={photos.p2} alt="Pulsera de cuentas rojas y un anillo de plata sobre piedra clara" />
          <Reveal className="pl-sale">
            <p className="pl-sale__title">Rebajas de media temporada</p>
            <p className="pl-sale__text">15 % en toda la plata. Solo esta semana.</p>
            <a className="pl-link" href="#piezas">Comprar ahora</a>
          </Reveal>
        </div>
      </section>

      <section id="piezas" className="pl-shop" aria-labelledby="pl-shop-title">
        <Reveal className="pl-head">
          <h2 id="pl-shop-title" className="pl-title">Piezas para todos los días</h2>
          <p className="pl-head__aside">Sencillas, ligeras y pensadas para combinar con todo.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="pl-card">
            <a className="pl-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la joya" /></a>
            <h3 className="pl-card__name" data-product-field="name">Joya</h3>
            <p className="pl-card__price" data-product-field="price" />
            <button type="button" className="pl-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="pl-grid" data-pagosya-catalog />
      </section>

      <section id="coleccion" className="pl-collection" aria-labelledby="pl-collection-title">
        <Parallax strength={70} mobileStrength={24} className="pl-drift"><img src={photos.p3} alt="Manos sosteniendo un anillo de plata cerca del hombro, en blanco y negro" /></Parallax>
        <Reveal className="pl-collection__copy">
          <p className="pl-kicker">Colección nueva</p>
          <h2 id="pl-collection-title" className="pl-title pl-title--light">Formas que se sienten</h2>
          <a className="pl-link pl-link--light" href="#piezas">Ver toda la colección</a>
        </Reveal>
      </section>

      <section id="materiales" className="pl-materials" aria-labelledby="pl-materials-title">
        <Reveal className="pl-head">
          <h2 id="pl-materials-title" className="pl-title">Hecho con cuidado</h2>
        </Reveal>
        <div className="pl-materials__grid">
          {materials.map((item, index) => <Reveal key={item.title} delay={index * 60}>
            <div className="pl-material">
              <p className="pl-material__title">{item.title}</p>
              <p className="pl-material__text">{item.text}</p>
            </div>
          </Reveal>)}
        </div>
      </section>

      <section id="lookbook" className="pl-look" aria-label="Lookbook">
        <Reveal className="pl-look__tall"><img src={photos.p4} alt="Tres anillos de plata sobre un bloque de yeso" /></Reveal>
        <Reveal className="pl-look__wide" delay={60}><img src={photos.estudio} alt="Mesa de joyero con herramientas y alambre de plata" /></Reveal>
        <Reveal className="pl-look__square" delay={120}><img src={photos.detalle} alt="Cadena de plata fina sobre tela de lino" /></Reveal>
      </section>

      <section id="cuidado" className="pl-care" aria-labelledby="pl-care-title">
        <Reveal className="pl-head">
          <h2 id="pl-care-title" className="pl-title">Cuida tus joyas</h2>
        </Reveal>
        <div className="pl-care__list">
          {care.map(item => <details key={item.q} className="pl-care__item">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>)}
        </div>
      </section>

      <section id="boletin" className="pl-news" aria-labelledby="pl-news-title" data-pagosya-subscribe-block>
        <Reveal className="pl-news__inner">
          <h2 id="pl-news-title" className="pl-news__title">Nuevas piezas, primero para ti</h2>
          <p className="pl-news__text">Recibe un aviso cuando llegue una colección de {store.name}. Sin llenar tu bandeja.</p>
          <button type="button" className="pl-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="pl-news__field">Tu correo electrónico</span>
            <span className="pl-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="pl-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
