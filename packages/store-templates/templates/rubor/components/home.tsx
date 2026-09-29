import { BeforeAfter, Parallax, Reveal } from '@pagosya/ui';
import Shell, { Wordmark, wordmarkFit } from './Shell';
import { store, photos } from './store-data';

const steps = [
  { title: 'limpia', when: 'Mañana y noche', text: 'Un gel suave que se lleva el maquillaje, el sol y la contaminación sin dejar la piel tirante.' },
  { title: 'hidrata', when: 'Mañana y noche', text: 'Sérum y crema en capas finas: el agua entra primero y la crema la guarda durante todo el día.' },
  { title: 'protege', when: 'Cada mañana', text: 'Protector solar de amplio espectro, también nublado. En la altura el sol pega más fuerte.' },
];

const ingredients = [
  { name: 'niacinamida', for: 'Poros y manchas', text: 'Afina la textura, equilibra el brillo y empareja el tono con el uso diario.' },
  { name: 'ácido hialurónico', for: 'Hidratación', text: 'Atrae y retiene el agua en la piel para que se vea jugosa y rellena.' },
  { name: 'vitamina C', for: 'Luminosidad', text: 'Antioxidante que devuelve la luz a la piel apagada y ayuda con las manchas.' },
  { name: 'centella', for: 'Calma', text: 'Planta calmante que alivia el enrojecimiento y acompaña a la piel sensible.' },
  { name: 'ceramidas', for: 'Barrera', text: 'Los ladrillos de la piel: reparan la barrera y evitan que el agua se escape.' },
  { name: 'SPF', for: 'Protección', text: 'Filtro contra los rayos UVA y UVB, el paso que cuida todo lo demás.' },
];

const reviews = [
  { quote: 'Con el frío de La Paz tenía la cara pelada. En dos semanas con el sérum y la crema, nada que ver.', name: 'Andrea', skin: 'Piel seca', city: 'La Paz' },
  { quote: 'Por fin un protector que no me deja blanca ni brillosa. Lo uso debajo del maquillaje todos los días.', name: 'Fernanda', skin: 'Piel mixta', city: 'Santa Cruz' },
  { quote: 'La rutina de tres pasos es corta de verdad. Me la aprendí en una noche y ya no la dejo.', name: 'Mariel', skin: 'Piel sensible', city: 'Cochabamba' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="piel" className="ru-hero" aria-labelledby="ru-hero-title">
        <img className="ru-hero__photo" src={photos.hero} alt="Retrato de una joven con la piel luminosa sobre un fondo rosa intenso" />
        <div className="ru-hero__top">
          <p className="ru-hero__claim">la revolución del cuidado de la piel</p>
          <a className="ru-pill ru-pill--red" href="#mas-queridos">Comprar ahora</a>
        </div>
        <h1 id="ru-hero-title" className="ru-hero__name" style={wordmarkFit(store.name)}><Wordmark className="ru-hero__word" /></h1>
      </section>

      <section id="rutina" className="ru-routine" aria-labelledby="ru-routine-title">
        <Reveal className="ru-head">
          <h2 id="ru-routine-title" className="ru-title">tu rutina en tres pasos<span className="ru-dot">.</span></h2>
          <p className="ru-head__aside">Sin veinte frascos ni reglas raras. Tres gestos, bien hechos, todos los días.</p>
        </Reveal>
        <ol className="ru-steps">
          {steps.map((step, index) => <li key={step.title} className={`ru-step ru-step--${index + 1}`}>
            <Reveal delay={index * 70} className="ru-step__inner">
              <p className="ru-step__n" aria-hidden="true">{String(index + 1).padStart(2, '0')}</p>
              <p className="ru-step__when">{step.when}</p>
              <h3 className="ru-step__title">{step.title}<span className="ru-dot">.</span></h3>
              <p className="ru-step__text">{step.text}</p>
            </Reveal>
          </li>)}
        </ol>
      </section>

      <section id="mas-queridos" className="ru-shop" aria-labelledby="ru-shop-title">
        <Reveal className="ru-head">
          <h2 id="ru-shop-title" className="ru-title">los más queridos<span className="ru-dot">.</span></h2>
          <p className="ru-head__aside">Los que se agotan primero y vuelven a pedir. Empieza por aquí.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ru-card">
            <a className="ru-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="ru-card__body">
              <h3 className="ru-card__name" data-product-field="name">Producto</h3>
              <p className="ru-card__price" data-product-field="price" />
            </div>
            <button type="button" className="ru-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ru-grid" data-pagosya-catalog />
      </section>

      <section id="ingredientes" className="ru-glossary" aria-labelledby="ru-glossary-title">
        <div className="ru-glossary__photo">
          <Parallax strength={120} mobileStrength={40} className="ru-drift"><img src={photos.textura} alt="Textura de crema rosada extendida en pinceladas" /></Parallax>
        </div>
        <div className="ru-glossary__body">
          <Reveal>
            <p className="ru-kicker">Glosario</p>
            <h2 id="ru-glossary-title" className="ru-title">lo que le pones a tu piel<span className="ru-dot">.</span></h2>
            <p className="ru-glossary__lead">Seis ingredientes que vas a ver una y otra vez en nuestras etiquetas, explicados sin rodeos.</p>
          </Reveal>
          <dl className="ru-terms">
            {ingredients.map((item, index) => <Reveal key={item.name} delay={(index % 2) * 60} className="ru-term">
              <dt><span className="ru-term__name">{item.name}</span><span className="ru-term__for">{item.for}</span></dt>
              <dd>{item.text}</dd>
            </Reveal>)}
          </dl>
        </div>
      </section>

      <section id="antes-despues" className="ru-compare" aria-labelledby="ru-compare-title">
        <Reveal className="ru-compare__copy">
          <p className="ru-kicker">Antes y después</p>
          <h2 id="ru-compare-title" className="ru-title">de tirante a jugosa<span className="ru-dot">.</span></h2>
          <p className="ru-compare__text">Una piel seca antes y después de dos semanas con limpiador, sérum y crema. Desliza para ver cómo cambia la textura cuando por fin recibe agua.</p>
          <p className="ru-compare__note">Imagen referencial. Cada piel responde a su ritmo.</p>
          <a className="ru-pill ru-pill--wine" href="#mas-queridos">Armar mi rutina</a>
        </Reveal>
        <div className="ru-compare__frame">
          <BeforeAfter
            before={{ src: photos.antes, alt: 'Mejilla con la piel seca y descamada, antes de la rutina' }}
            after={{ src: photos.despues, alt: 'La misma mejilla con la piel hidratada y luminosa, después de la rutina' }}
            label="Compara la piel antes y después"
            initial={50}
            aspect="4/5"
          />
        </div>
      </section>

      <section id="resenas" className="ru-reviews" aria-labelledby="ru-reviews-title">
        <Reveal className="ru-head">
          <h2 id="ru-reviews-title" className="ru-title">lo que dice su piel<span className="ru-dot">.</span></h2>
          <p className="ru-head__aside">Reseñas de quienes ya hicieron de la rutina un hábito.</p>
        </Reveal>
        <div className="ru-quotes">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 70} className="ru-quote">
            <figure>
              <p className="ru-quote__stars" aria-label="5 de 5 estrellas">★★★★★</p>
              <blockquote className="ru-quote__text">{review.quote}</blockquote>
              <figcaption className="ru-quote__who"><b>{review.name}</b><span>{review.city}</span><span className="ru-quote__skin">{review.skin}</span></figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="ru-news" aria-labelledby="ru-news-title" data-pagosya-subscribe-block>
        <Reveal className="ru-news__inner">
          <h2 id="ru-news-title" className="ru-news__title">únete al club<span className="ru-dot">.</span></h2>
          <p className="ru-news__text">Consejos para tu tipo de piel, lanzamientos antes que nadie y un regalo en tu primera compra.</p>
          <button type="button" className="ru-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="ru-news__field">Tu correo electrónico</span>
            <span className="ru-news__submit">Quiero unirme</span>
          </button>
          <p role="status" className="ru-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
