import { Parallax, Reveal } from '@pagosya/ui';
import Shell, { Paw } from './Shell';
import { photos } from './store-data';

const pets = [
  { slot: 'perro', name: 'Perro', note: 'Juguetes para morder y correr', alt: 'Golden retriever sonriente sobre fondo amarillo' },
  { slot: 'gato', name: 'Gato', note: 'Rascadores, camas y mimos', alt: 'Gato atigrado de ojos verdes sobre fondo celeste' },
  { slot: 'cachorro', name: 'Cachorro', note: 'Sus primeras cosas', alt: 'Cachorro beagle con las orejas caídas' },
  { slot: 'senior', name: 'Senior', note: 'Comodidad para los años dorados', alt: 'Labrador mayor con el hocico canoso' },
];

const portions = [
  { weight: 'Hasta 5 kg', cups: '½ a 1 taza' },
  { weight: '5 a 15 kg', cups: '1 a 2 tazas' },
  { weight: '15 a 30 kg', cups: '2 a 3 tazas' },
  { weight: 'Más de 30 kg', cups: '3 a 4 tazas' },
];

const perks = ['Pides cuando quieras, sin compromiso', 'Te avisamos antes de que se acabe la comida', 'Un regalo en su cumpleaños'];

const reviews = [
  { quote: 'Toby destrozaba todos los juguetes en un día. La cuerda trenzada ya lleva tres meses y sigue entera.', owner: 'Mariana', pet: 'Toby', kind: 'Mestizo', city: 'La Paz' },
  { quote: 'Mi gata no se subía a ninguna cama. Esta la eligió ella sola la primera noche y ya no la suelta.', owner: 'Rodrigo', pet: 'Mishi', kind: 'Gata atigrada', city: 'Cochabamba' },
  { quote: 'Pido la comida cada mes con el club y me llega antes de que se acabe. Lola come feliz y yo ahorro.', owner: 'Fernanda', pet: 'Lola', kind: 'Golden retriever', city: 'Santa Cruz' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="colas" className="co-hero" aria-labelledby="co-hero-title">
        <div className="co-hero__photo"><img src={photos.hero} alt="Cinco perros felices de distintas razas, vistos desde arriba sobre un piso ciruela con juguetes de colores" /></div>
        <div className="co-hero__box">
          <Paw className="co-hero__paw" />
          <h1 id="co-hero-title" className="co-hero__title">Colas felices empiezan aquí</h1>
          <p className="co-hero__lead">Juguetes, camas y comida que tu mascota va a amar.</p>
          <a className="co-btn" href="#favoritos">Comprar</a>
        </div>
      </section>

      <section id="por-mascota" className="co-pets" aria-labelledby="co-pets-title">
        <Reveal className="co-head co-head--center">
          <p className="co-kicker">Compra por mascota</p>
          <h2 id="co-pets-title" className="co-title">¿Quién espera en casa?</h2>
        </Reveal>
        <ul className="co-pets__grid">
          {pets.map((pet, index) => <li key={pet.slot}>
            <Reveal delay={index * 70}>
              <a className={`co-pet co-pet--${pet.slot}`} href="#favoritos">
                <span className="co-pet__photo"><img src={photos[pet.slot]} alt={pet.alt} /></span>
                <span className="co-pet__name">{pet.name}</span>
                <span className="co-pet__note">{pet.note}</span>
              </a>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="favoritos" className="co-shop" aria-labelledby="co-shop-title">
        <Reveal className="co-head">
          <div>
            <p className="co-kicker">Favoritos</p>
            <h2 id="co-shop-title" className="co-title">Lo que más mueve colas</h2>
          </div>
          <p className="co-head__aside">Probado por perros y gatos exigentes antes de llegar a la tienda.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="co-card">
            <a className="co-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="co-card__body">
              <h3 className="co-card__name" data-product-field="name">Producto</h3>
              <p className="co-card__price" data-product-field="price" />
              <button type="button" className="co-card__add" data-product-add>Agregar</button>
            </div>
          </article>
        </template>
        <div className="co-grid" data-pagosya-catalog />
      </section>

      <section id="nutricion" className="co-food" aria-labelledby="co-food-title">
        <div className="co-food__photo">
          <Parallax strength={70} mobileStrength={28} className="co-drift"><img src={photos.comida} alt="Perro comiendo croquetas de un plato de cerámica en la cocina" /></Parallax>
        </div>
        <Reveal className="co-food__copy">
          <p className="co-kicker">Nutrición</p>
          <h2 id="co-food-title" className="co-title">¿Cuánto le sirvo?</h2>
          <p className="co-food__text">Una guía rápida para perros adultos con croquetas secas. Reparte la porción en dos comidas y deja siempre agua fresca a mano.</p>
          <div className="co-guide">
            <p className="co-guide__title">Guía de porciones al día</p>
            <dl className="co-guide__table">
              {portions.map(row => <div key={row.weight}><dt>{row.weight}</dt><dd>{row.cups}</dd></div>)}
            </dl>
            <p className="co-guide__note">Referencial: ajústala según la edad y la actividad, y consulta a tu veterinario.</p>
          </div>
          <a className="co-btn" href="#favoritos">Ver alimentos</a>
        </Reveal>
      </section>

      <section id="club" className="co-club" aria-labelledby="co-club-title">
        <Paw className="co-club__paw co-club__paw--a" />
        <Paw className="co-club__paw co-club__paw--b" />
        <Reveal className="co-club__inner">
          <h2 id="co-club-title" className="co-club__title">Club Colita: 10% en cada pedido repetido</h2>
          <ul className="co-club__perks">{perks.map(perk => <li key={perk}>{perk}</li>)}</ul>
          <a className="co-btn" href="#favoritos">Hacer mi primer pedido</a>
        </Reveal>
      </section>

      <section id="resenas" className="co-reviews" aria-labelledby="co-reviews-title">
        <Reveal className="co-head co-head--center">
          <p className="co-kicker">Opiniones</p>
          <h2 id="co-reviews-title" className="co-title">Lo dicen sus humanos</h2>
        </Reveal>
        <div className="co-quotes">
          {reviews.map(review => <figure key={review.owner} className="co-quote">
            <p className="co-quote__stars" aria-hidden="true">★★★★★</p>
            <blockquote className="co-quote__text">{review.quote}</blockquote>
            <figcaption className="co-quote__who"><b>{review.owner} y {review.pet}</b><span>{review.kind} · {review.city}</span></figcaption>
          </figure>)}
        </div>
      </section>

      <section id="boletin" className="co-news" aria-labelledby="co-news-title" data-pagosya-subscribe-block>
        <Reveal className="co-news__inner">
          <h2 id="co-news-title" className="co-news__title">Noticias con cola</h2>
          <p className="co-news__text">Novedades, consejos de cuidado y ofertas para tu mascota, una vez al mes.</p>
          <button type="button" className="co-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="co-news__field">Tu correo electrónico</span>
            <span className="co-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="co-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
