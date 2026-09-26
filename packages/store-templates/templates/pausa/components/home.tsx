import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const steps = [
  { t: 'Elige tu clase o paquete', b: 'Clase suelta, paquete del mes o tu primera clase de prueba.' },
  { t: 'Paga en línea', b: 'Con QR o tarjeta, en un minuto desde tu celular.' },
  { t: 'Coordinamos tu horario', b: 'Te escribimos para confirmar el día y la hora que te queden mejor.' },
];
const faqs = [
  { q: '¿Nunca hice pilates, puedo empezar?', a: 'Sí. Las clases se adaptan a tu nivel y la primera es para conocerte.' },
  { q: '¿Qué tengo que llevar?', a: 'Ropa cómoda y medias antideslizantes. Nosotros tenemos todo lo demás.' },
  { q: '¿Puedo cambiar mi horario?', a: 'Avísanos con 24 horas y reprogramamos tu clase sin costo.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="pa2-hero">
        <div className="pa2-hero__copy">
          <p className="pa2-kicker">Pilates · Yoga · Bienestar</p>
          <h1 className="pa2-display">Un respiro<br /><em>para tu cuerpo.</em></h1>
          <p className="pa2-lead">Clases en grupos pequeños, con instructoras que te acompañan en cada movimiento.</p>
          <div className="pa2-actions"><a className="pa2-btn" href="#clases">Reservar una clase</a><a className="pa2-link" href="#como">Cómo funciona</a></div>
        </div>
        <div className="pa2-hero__arch"><Parallax strength={80} mobileStrength={30} className="pa2-drift"><img src={photos.hero} alt={`El estudio de ${store.name}`} /></Parallax></div>
      </section>

      <section id="clases" className="pa2-shop" aria-labelledby="pa2-shop-title">
        <Reveal className="pa2-shop__head">
          <p className="pa2-kicker">Clases y paquetes</p>
          <h2 id="pa2-shop-title" className="pa2-title">Elige cómo empezar</h2>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="pa2-card">
            <a className="pa2-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la clase" /></a>
            <div className="pa2-card__body">
              <h3 className="pa2-card__name" data-product-field="name">Clase</h3>
              <p className="pa2-card__desc" data-product-field="description" />
              <div className="pa2-card__row"><span className="pa2-card__price" data-product-field="price" /><button type="button" className="pa2-card__add" data-product-add>Reservar</button></div>
            </div>
          </article>
        </template>
        <div className="pa2-list" data-pagosya-catalog />
      </section>

      <section id="como" className="pa2-how" aria-labelledby="pa2-how-title">
        <Reveal><h2 id="pa2-how-title" className="pa2-title">Así de simple</h2></Reveal>
        <Reveal delay={100}><ol>{steps.map((step, index) => <li key={step.t}><span>{index + 1}</span><h3>{step.t}</h3><p>{step.b}</p></li>)}</ol></Reveal>
      </section>

      <section id="estudio" className="pa2-studio" aria-label="El estudio">
        <Parallax strength={120} className="pa2-drift pa2-drift--deep"><img src={photos.estudio} alt="" aria-hidden="true" /></Parallax>
        <Reveal><p className="pa2-quote">“Sal de la clase más liviana de lo que entraste.”</p></Reveal>
      </section>

      <section className="pa2-team" aria-labelledby="pa2-team-title">
        <Reveal><img src={photos.instructora} alt="Una de nuestras instructoras" /></Reveal>
        <Reveal delay={120}>
          <p className="pa2-kicker">Quién te acompaña</p>
          <h2 id="pa2-team-title" className="pa2-title">Instructoras certificadas, con paciencia de verdad.</h2>
          <p>Te corregimos con cariño, adaptamos cada ejercicio y celebramos tus avances. Aquí nadie compite.</p>
        </Reveal>
      </section>

      <section id="preguntas" className="pa2-faq" aria-labelledby="pa2-faq-title">
        <Reveal><h2 id="pa2-faq-title" className="pa2-title">Preguntas</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
