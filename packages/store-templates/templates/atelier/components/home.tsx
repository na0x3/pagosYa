import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const materials = [
  { name: 'Cuero vegetal', note: 'Curtido con taninos de corteza. Envejece con belleza.', tone: 'tan' },
  { name: 'Latón macizo', note: 'Herrajes fundidos y pulidos a mano. No se desprenden.', tone: 'brass' },
  { name: 'Hilo encerado', note: 'Costura a mano con doble puntada. Dura décadas.', tone: 'wine' },
];

const notes = [
  { n: '01', title: 'Forro de algodón', text: 'Suave al tacto y fácil de limpiar por dentro.' },
  { n: '02', title: 'Bolsillo oculto', text: 'Para lo que no quieres que se vea, ni que se pierda.' },
  { n: '03', title: 'Asa desmontable', text: 'De mano o al hombro, como prefieras cada día.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="at-hero" aria-labelledby="at-hero-title">
        <img className="at-hero__photo" src={photos.p1} alt="Diseñadora frente a un muro de muestras de cuero y tela, en una luz baja" />
        <div className="at-hero__copy">
          <h1 id="at-hero-title" className="at-hero__title">Hecho con distinción</h1>
          <p className="at-hero__lead">Cada pieza de {store.name} se corta, se cose y se termina a mano, en series de a pocas.</p>
          <a className="at-link at-link--light" href="#piezas">Explorar la colección</a>
        </div>
      </section>

      <section id="piezas" className="at-shop" aria-labelledby="at-shop-title">
        <Reveal className="at-head">
          <h2 id="at-shop-title" className="at-title">La colección</h2>
          <p className="at-head__aside">Piezas atemporales para llevar todos los días.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="at-card">
            <a className="at-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la pieza" /></a>
            <h3 className="at-card__name" data-product-field="name">Pieza</h3>
            <p className="at-card__price" data-product-field="price" />
            <button type="button" className="at-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="at-grid" data-pagosya-catalog />
      </section>

      <section id="oficio" className="at-craft" aria-labelledby="at-craft-title">
        <div className="at-craft__photo">
          <Parallax strength={60} mobileStrength={22} className="at-drift"><img src={photos.taller} alt="Manos cosiendo cuero marrón a mano con hilo encerado" /></Parallax>
        </div>
        <Reveal className="at-craft__copy">
          <p className="at-kicker">El oficio</p>
          <h2 id="at-craft-title" className="at-title">Una puntada a la vez</h2>
          <p>Cortamos cada pieza a mano y cosemos con doble puntada, como se hacía antes. Por eso dos bolsos nunca son idénticos, y por eso duran tanto.</p>
        </Reveal>
      </section>

      <section id="materiales" className="at-materials" aria-labelledby="at-materials-title">
        <Reveal className="at-head at-head--light">
          <h2 id="at-materials-title" className="at-title at-title--light">Materiales que envejecen bien</h2>
        </Reveal>
        <div className="at-materials__grid">
          {materials.map((item, index) => <Reveal key={item.name} delay={index * 60}>
            <div className="at-material">
              <span className={`at-material__swatch at-material__swatch--${item.tone}`} aria-hidden="true" />
              <b className="at-material__name">{item.name}</b>
              <span className="at-material__note">{item.note}</span>
            </div>
          </Reveal>)}
        </div>
      </section>

      <section id="regalos" className="at-gifts" aria-labelledby="at-gifts-title">
        <Reveal className="at-gifts__inner">
          <img className="at-gifts__photo" src={photos.detalle} alt="Primer plano de un herraje de latón y la textura del cuero" />
          <div className="at-gifts__copy">
            <p className="at-kicker">Regalos</p>
            <h2 id="at-gifts-title" className="at-title">Para quien merece algo que dure</h2>
            <p>Cada pedido sale con estuche, tarjeta escrita a mano y un paño de cuidado. Podemos grabar unas iniciales sin costo.</p>
            <a className="at-link" href="#piezas">Elegir un regalo</a>
          </div>
        </Reveal>
      </section>

      <section id="atelier" className="at-feature" aria-labelledby="at-feature-title">
        <Reveal className="at-feature__photo"><img src={photos.p2} alt="Bolso de cuero color canela sobre una superficie de nogal oscuro" /></Reveal>
        <Reveal className="at-feature__copy" delay={80}>
          <p className="at-kicker">Pieza del taller</p>
          <h2 id="at-feature-title" className="at-title">El bolso de mano</h2>
          <ul className="at-notes">
            {notes.map(note => <li key={note.n}><span className="at-notes__n">{note.n}</span><span><b>{note.title}</b>{note.text}</span></li>)}
          </ul>
          <a className="at-btn" href="#piezas">Ver la pieza</a>
        </Reveal>
      </section>

      <section id="boletin" className="at-news" aria-labelledby="at-news-title" data-pagosya-subscribe-block>
        <Reveal className="at-news__inner">
          <h2 id="at-news-title" className="at-news__title">Sé el primero en conocer cada serie</h2>
          <p className="at-news__text">Un aviso por serie nueva, con fotos del taller. Nada más.</p>
          <button type="button" className="at-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="at-news__field">Tu correo electrónico</span>
            <span className="at-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="at-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
