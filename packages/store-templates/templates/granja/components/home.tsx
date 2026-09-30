import type { CSSProperties } from 'react';
import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

/** The store name, one word per line, for the stacked hero title. */
const nameWords = store.name.split(/\s+/).filter(Boolean);
/** The longest word's length sizes the title so that word fits one line instead of breaking mid-word. */
const nameFit = { '--gr-fit': Math.max(4, ...nameWords.map(word => Array.from(word).length)) } as CSSProperties;

const promises = ['100% orgánico', 'Pastoreo libre', 'Sin químicos'];

const care = [
  { slot: 'gallinas', title: 'Gallinas libres', text: 'Duermen en el gallinero y pasan el día afuera, escarbando entre el pasto y el sol.', alt: 'Gallinas coloradas picoteando el pasto frente a un gallinero de madera' },
  { slot: 'pasto', title: 'Pasto que rota', text: 'Movemos el corral cada semana para que el potrero descanse y siempre haya trébol fresco.', alt: 'Pasto y trébol con rocío de la mañana, con gallinas al fondo' },
  { slot: 'recoleccion', title: 'Recolección a mano', text: 'Juntamos los huevos cada mañana, uno por uno, y los revisamos antes de ponerlos en la canasta.', alt: 'Manos recogiendo huevos del nido de paja y poniéndolos en una canasta de mimbre' },
];

const rounds = [
  { day: 'Martes', zones: ['Cercado', 'Sacaba'], cutoff: 'Pide hasta el lunes a las 18:00', tone: 'yolk' },
  { day: 'Viernes', zones: ['Cercado', 'Quillacollo'], cutoff: 'Pide hasta el jueves a las 18:00', tone: 'field' },
];

const faqs = [
  { q: '¿Las gallinas son libres de verdad?', a: 'Sí. Salen al potrero todos los días desde que amanece y vuelven al gallinero solas al atardecer. Puedes comprobarlo cualquier sábado.' },
  { q: '¿Cuánto duran los huevos frescos?', a: 'Hasta cuatro semanas en un lugar fresco, o más en el refrigerador. Los recogemos la víspera de cada reparto, así que llegan con días de ventaja.' },
  { q: '¿Cómo pago mi pedido?', a: 'Al confirmar la canasta pagas con QR o con tarjeta, de forma segura. Te avisamos cuando el pedido sale de la granja.' },
  { q: '¿Puedo cambiar mi día de reparto?', a: 'Claro. Escríbenos antes del cierre del pedido y lo pasamos al martes o al viernes, según tu zona.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="campo" className="gr-hero" aria-labelledby="gr-hero-title">
        <img className="gr-hero__photo" src={photos.hero} alt="Gallinas sueltas en un potrero verde y una mano con una canasta de huevos de campo" />
        <div className="gr-hero__inner">
          <p className="gr-hero__kicker">Granja familiar{store.city ? ` · ${store.city}` : ''}</p>
          <h1 id="gr-hero-title" className="gr-hero__title" style={nameFit}>{nameWords.map((word, index) => <span key={index} className="gr-hero__word">{word}{index < nameWords.length - 1 ? ' ' : ''}</span>)}</h1>
          <div className="gr-hero__foot">
            <p className="gr-hero__lead">Huevos, queso fresco y miel del campo, del potrero a tu mesa dos veces por semana.</p>
            <a className="gr-btn gr-btn--yolk" href="#canasta">Hacer mi pedido</a>
          </div>
        </div>
        <ul className="gr-strip" aria-label="Nuestra forma de criar">
          {promises.map(promise => <li key={promise}>{promise}</li>)}
        </ul>
      </section>

      <section id="canasta" className="gr-shop" aria-labelledby="gr-shop-title">
        <Reveal className="gr-head">
          <div>
            <p className="gr-kicker">Recién salido de la granja</p>
            <h2 id="gr-shop-title" className="gr-title">La canasta</h2>
          </div>
          <p className="gr-head__aside">Todo se recoge la víspera del reparto. Lo que ves aquí es lo que hay esta semana.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="gr-card">
            <a className="gr-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="gr-card__body">
              <h3 className="gr-card__name" data-product-field="name">Producto</h3>
              <p className="gr-card__price" data-product-field="price" />
            </div>
            <button type="button" className="gr-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="gr-grid" data-pagosya-catalog />
      </section>

      <section id="como-criamos" className="gr-care" aria-labelledby="gr-care-title">
        <Reveal className="gr-head gr-head--light">
          <div>
            <p className="gr-kicker">Cómo criamos</p>
            <h2 id="gr-care-title" className="gr-title">Del potrero a tu mesa</h2>
          </div>
        </Reveal>
        <ol className="gr-care__list">
          {care.map((step, index) => <li key={step.slot}>
            <Reveal delay={index * 90} className="gr-step">
              <div className="gr-step__photo"><img src={photos[step.slot]} alt={step.alt} /></div>
              <p className="gr-step__n" aria-hidden="true">{String(index + 1).padStart(2, '0')}</p>
              <h3 className="gr-step__title">{step.title}</h3>
              <p className="gr-step__text">{step.text}</p>
            </Reveal>
          </li>)}
        </ol>
      </section>

      <section id="reparto" className="gr-rounds" aria-labelledby="gr-rounds-title">
        <Reveal className="gr-head">
          <div>
            <p className="gr-kicker">Dos días por semana</p>
            <h2 id="gr-rounds-title" className="gr-title">Reparto a domicilio</h2>
          </div>
          <p className="gr-head__aside">Llevamos tu canasta por Cochabamba de 8:00 a 13:00. ¿Vives en otra zona? Escríbenos y coordinamos.</p>
        </Reveal>
        <div className="gr-rounds__grid">
          {rounds.map((round, index) => <Reveal key={round.day} delay={index * 90} className={`gr-round gr-round--${round.tone}`}>
            <p className="gr-round__kicker">Día de reparto</p>
            <h3 className="gr-round__day">{round.day}</h3>
            <ul className="gr-round__zones">
              {round.zones.map(zone => <li key={zone}>{zone}</li>)}
            </ul>
            <p className="gr-round__cutoff">{round.cutoff}</p>
          </Reveal>)}
        </div>
      </section>

      <section id="visita" className="gr-visit" aria-labelledby="gr-visit-title">
        <div className="gr-visit__photo">
          <Parallax strength={70} mobileStrength={26} className="gr-drift"><img src={photos.granjero} alt="Granjero con botas de goma cruzando el potrero al amanecer con un balde, entre gallinas" /></Parallax>
        </div>
        <Reveal className="gr-visit__copy">
          <p className="gr-kicker">Puertas abiertas</p>
          <h2 id="gr-visit-title" className="gr-title">Visítanos los sábados</h2>
          <p className="gr-visit__text">Abrimos la tranquera cada sábado por la mañana. Recoge tu canasta, conoce a las gallinas y llévate el queso del día.</p>
          <dl className="gr-facts">
            <div><dt>Horario</dt><dd>Sábados de 9:00 a 13:00</dd></div>
            <div><dt>Recojo</dt><dd>Tu pedido listo en la entrada, sin costo</dd></div>
            <div><dt>Niños</dt><dd>Bienvenidos, con permiso de las gallinas</dd></div>
          </dl>
          <a className="gr-btn" href="#canasta">Pedir para recoger</a>
        </Reveal>
      </section>

      <section id="preguntas" className="gr-faq" aria-labelledby="gr-faq-title">
        <Reveal className="gr-faq__head">
          <p className="gr-kicker">Preguntas</p>
          <h2 id="gr-faq-title" className="gr-title">Lo que más nos preguntan</h2>
          <p className="gr-faq__note">¿Otra duda? En {store.name} respondemos cada mensaje antes del siguiente reparto.</p>
        </Reveal>
        <div className="gr-faq__list">
          {faqs.map(faq => <details key={faq.q} className="gr-qa">
            <summary className="gr-qa__q"><span>{faq.q}</span><span className="gr-qa__icon" aria-hidden="true" /></summary>
            <p className="gr-qa__a">{faq.a}</p>
          </details>)}
        </div>
      </section>
    </main>
  </Shell>;
}
