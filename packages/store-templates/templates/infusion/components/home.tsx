import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { photos } from './store-data';

const families = [
  { name: 'Verde', notes: 'Hierba fresca, almendra y un final dulce.' },
  { name: 'Negro', notes: 'Malta, miel oscura y cuerpo redondo.' },
  { name: 'Hierbas', notes: 'Menta, manzanilla y cáscara de naranja.' },
  { name: 'Coca', notes: 'Suave, terrosa y tradicional de los Andes.' },
];

const steps = [
  { n: '1', title: 'Calienta el agua', text: 'A 80 °C para té verde, 95 °C para negro y hierbas.' },
  { n: '2', title: 'Deja reposar', text: 'De 2 a 4 minutos, según qué tan intenso lo quieras.' },
  { n: '3', title: 'Sirve despacio', text: 'Cuela las hojas y disfruta antes de que se enfríe.' },
];

const reviews = [
  { quote: 'Las hojas llegan enteras y el aroma se siente desde la bolsa.', who: 'Camila, La Paz' },
  { quote: 'El té verde es suave y dulce. Ya es parte de mi mañana.', who: 'Andrés, Cochabamba' },
  { quote: 'Regalé el set y me pidieron dónde comprarlo.', who: 'Lucía, Santa Cruz' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="in-hero" aria-labelledby="in-hero-title">
        <div className="in-hero__copy">
          <p className="in-hero__kicker">Siempre es</p>
          <h1 id="in-hero-title" className="in-hero__title">Hora del té</h1>
          <p className="in-hero__lead">Hojas enteras, elegidas con calma para tu taza de cada día.</p>
          <a className="in-btn" href="#tes">Comprar</a>
        </div>
        <img className="in-hero__photo" src={photos.p1} alt="Manos sirviendo té verde desde una tetera de cerámica junto a un batidor de bambú" />
      </section>

      <section id="tes" className="in-shop" aria-labelledby="in-shop-title">
        <Reveal className="in-head">
          <h2 id="in-shop-title" className="in-title">Nuestros tés</h2>
          <p className="in-head__aside">Cada lote se prueba antes de llegar a tu casa.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="in-card">
            <a className="in-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="in-card__name" data-product-field="name">Producto</h3>
            <p className="in-card__price" data-product-field="price" />
            <button type="button" className="in-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="in-grid" data-pagosya-catalog />
      </section>

      <section id="familias" className="in-fam" aria-labelledby="in-fam-title">
        <Reveal className="in-head">
          <h2 id="in-fam-title" className="in-title">Cuatro familias</h2>
        </Reveal>
        <div className="in-fam__grid">
          {families.map((fam, index) => <Reveal key={fam.name} delay={index * 60}>
            <div className="in-fam__item"><b>{fam.name}</b><span>{fam.notes}</span></div>
          </Reveal>)}
        </div>
      </section>

      <section id="ceremonia" className="in-cer" aria-labelledby="in-cer-title">
        <div className="in-cer__frame">
          <Parallax strength={50} mobileStrength={20} className="in-drift"><img className="in-cer__photo" src={photos.ceremonia} alt="Mesa de cata de té con pequeños cuencos y tazas" /></Parallax>
        </div>
        <Reveal className="in-cer__copy">
          <h2 id="in-cer-title" className="in-title">Prepáralo como ceremonia</h2>
          <ol className="in-cer__list">
            {steps.map(step => <li key={step.n}><span className="in-cer__n">{step.n}</span><span><b>{step.title}</b><br />{step.text}</span></li>)}
          </ol>
        </Reveal>
      </section>

      <section id="regalo" className="in-gift" aria-labelledby="in-gift-title">
        <Reveal className="in-gift__inner">
          <h2 id="in-gift-title" className="in-gift__title">Un set para regalar</h2>
          <p className="in-gift__text">Tres tés en latas azules, con una tarjeta escrita a mano.</p>
          <a className="in-btn in-btn--light" href="#tes">Ver los sets</a>
        </Reveal>
        <img className="in-gift__photo" src={photos.p2} alt="Lata azul marino de té sobre fondo de papel" />
      </section>

      <section id="suscripcion" className="in-sub" aria-labelledby="in-sub-title">
        <div className="in-sub__photos">
          <img src={photos.p3} alt="Hojas de té verde suelto en una cuchara de madera" />
          <img src={photos.p4} alt="Vaso de vidrio con infusión de hierbas y flores secas" />
        </div>
        <Reveal className="in-sub__copy">
          <h2 id="in-sub-title" className="in-title">Una caja de té cada mes</h2>
          <p>Recibe una selección nueva, con notas de cata y una idea de preparación. Cancela cuando quieras.</p>
          <a className="in-btn" href="#tes">Suscribirme</a>
        </Reveal>
      </section>

      <section id="resenas" className="in-rev" aria-labelledby="in-rev-title">
        <Reveal className="in-head">
          <h2 id="in-rev-title" className="in-title">Lo que dicen</h2>
        </Reveal>
        <div className="in-rev__grid">
          {reviews.map((rev, index) => <Reveal key={rev.who} delay={index * 60}>
            <figure className="in-rev__item"><blockquote>{rev.quote}</blockquote><figcaption>{rev.who}</figcaption></figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="in-news" aria-labelledby="in-news-title" data-pagosya-subscribe-block>
        <Reveal className="in-news__inner">
          <h2 id="in-news-title" className="in-news__title">Recibe nuestras notas de cata</h2>
          <p className="in-news__text">Nuevos tés, recetas y ofertas, una vez al mes.</p>
          <button type="button" className="in-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="in-news__field">Tu correo electrónico</span>
            <span className="in-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="in-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
