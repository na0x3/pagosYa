import { Parallax, Reveal } from '@pagosya/ui';
import Shell, { Paw } from './Shell';
import { photos, copy } from './store-data';

const pets = [
  { slot: 'perro', name: copy.home_1, note: copy.home_2, alt: copy.home_3 },
  { slot: 'gato', name: copy.home_4, note: copy.home_5, alt: copy.home_6 },
  { slot: 'cachorro', name: copy.home_7, note: copy.home_8, alt: copy.home_9 },
  { slot: 'senior', name: copy.home_10, note: copy.home_11, alt: copy.home_12 },
];

const portions = [
  { weight: copy.home_13, cups: copy.home_14 },
  { weight: '5 a 15 kg', cups: '1 a 2 tazas' },
  { weight: '15 a 30 kg', cups: '2 a 3 tazas' },
  { weight: copy.home_15, cups: '3 a 4 tazas' },
];

const perks = [copy.home_16, copy.home_17, copy.home_18];

const reviews = [
  { quote: copy.home_19, owner: copy.home_20, pet: copy.home_21, kind: 'Mestizo', city: copy.home_22 },
  { quote: copy.home_23, owner: copy.home_24, pet: copy.home_25, kind: 'Gata atigrada', city: copy.home_26 },
  { quote: copy.home_27, owner: copy.home_28, pet: copy.home_29, kind: 'Golden retriever', city: copy.home_30 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="colas" className="co-hero" aria-labelledby="co-hero-title">
        <div className="co-hero__photo"><img src={photos.hero} alt={copy.home_31} /></div>
        <div className="co-hero__box">
          <Paw className="co-hero__paw" />
          <h1 id="co-hero-title" className="co-hero__title">{copy.home_32}</h1>
          <p className="co-hero__lead">{copy.home_33}</p>
          <a className="co-btn" href="#favoritos">{copy.home_34}</a>
        </div>
      </section>

      <section id="por-mascota" className="co-pets" aria-labelledby="co-pets-title">
        <Reveal className="co-head co-head--center">
          <p className="co-kicker">{copy.home_35}</p>
          <h2 id="co-pets-title" className="co-title">{copy.home_36}</h2>
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
            <p className="co-kicker">{copy.home_37}</p>
            <h2 id="co-shop-title" className="co-title">{copy.home_38}</h2>
          </div>
          <p className="co-head__aside">{copy.home_39}</p>
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
          <Parallax strength={70} mobileStrength={28} className="co-drift"><img src={photos.comida} alt={copy.home_40} /></Parallax>
        </div>
        <Reveal className="co-food__copy">
          <p className="co-kicker">{copy.home_41}</p>
          <h2 id="co-food-title" className="co-title">{copy.home_42}</h2>
          <p className="co-food__text">{copy.home_43}</p>
          <div className="co-guide">
            <p className="co-guide__title">{copy.home_44}</p>
            <dl className="co-guide__table">
              {portions.map(row => <div key={row.weight}><dt>{row.weight}</dt><dd>{row.cups}</dd></div>)}
            </dl>
            <p className="co-guide__note">{copy.home_45}</p>
          </div>
          <a className="co-btn" href="#favoritos">{copy.home_46}</a>
        </Reveal>
      </section>

      <section id="club" className="co-club" aria-labelledby="co-club-title">
        <Paw className="co-club__paw co-club__paw--a" />
        <Paw className="co-club__paw co-club__paw--b" />
        <Reveal className="co-club__inner">
          <h2 id="co-club-title" className="co-club__title">{copy.home_47}</h2>
          <ul className="co-club__perks">{perks.map(perk => <li key={perk}>{perk}</li>)}</ul>
          <a className="co-btn" href="#favoritos">{copy.home_48}</a>
        </Reveal>
      </section>

      <section id="resenas" className="co-reviews" aria-labelledby="co-reviews-title">
        <Reveal className="co-head co-head--center">
          <p className="co-kicker">{copy.home_49}</p>
          <h2 id="co-reviews-title" className="co-title">{copy.home_50}</h2>
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
          <h2 id="co-news-title" className="co-news__title">{copy.home_51}</h2>
          <p className="co-news__text">{copy.home_52}</p>
          <button type="button" className="co-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="co-news__field">{copy.home_53}</span>
            <span className="co-news__submit">{copy.home_54}</span>
          </button>
          <p role="status" className="co-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
