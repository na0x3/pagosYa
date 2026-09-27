import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const badges = ['Técnicos verificados', 'Precio cerrado', 'Garantía de 30 días'];
const steps = [
  { t: 'Elige el servicio', b: 'Cada servicio tiene su precio a la vista, sin sorpresas.' },
  { t: 'Paga en línea', b: 'Con QR o tarjeta. Tu pago queda registrado.' },
  { t: 'Te llamamos y vamos', b: 'Coordinamos el horario y llegamos con todo lo necesario.' },
];
const zones = ['Centro', 'Zona Norte', 'Zona Sur', 'Zona Este', 'Zona Oeste', 'Alrededores'];
const faqs = [
  { q: '¿Qué pasa si el trabajo necesita repuestos?', a: 'Te avisamos antes con el precio del repuesto. Nada se cambia sin tu aprobación.' },
  { q: '¿El servicio tiene garantía?', a: 'Sí, 30 días. Si algo falla por nuestro trabajo, volvemos sin costo.' },
  { q: '¿Cuándo llegan?', a: 'Te llamamos apenas recibimos tu pedido para acordar el horario, normalmente el mismo día.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="ta-hero">
        <div className="ta-hero__copy">
          <p className="ta-kicker">Reparaciones y mantenimiento</p>
          <h1 className="ta-display">Lo arreglamos, <span>hoy.</span></h1>
          <p className="ta-lead">Electricidad, plomería, electrodomésticos y limpieza. Pide en línea y te llamamos para coordinar.</p>
          <a className="ta-btn" href="#servicios">Pedir un servicio</a>
          <ul className="ta-badges">{badges.map(badge => <li key={badge}>{badge}</li>)}</ul>
        </div>
        <div className="ta-hero__photo">
          <Parallax strength={120} mobileStrength={50} className="ta-drift"><img src={photos.hero} alt={`Un técnico de ${store.name} trabajando`} /></Parallax>
          <p className="ta-hero__tag">Respuesta en 2 horas</p>
        </div>
      </section>

      <section id="servicios" className="ta-shop" aria-labelledby="ta-shop-title">
        <Reveal className="ta-shop__head"><h2 id="ta-shop-title" className="ta-title">Servicios</h2><p>Precio cerrado por trabajo. Materiales aparte, siempre con tu aprobación.</p></Reveal>
        <template data-pagosya-product-template>
          <article className="ta-card">
            <a className="ta-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del servicio" /></a>
            <div className="ta-card__body">
              <h3 className="ta-card__name" data-product-field="name">Servicio</h3>
              <p className="ta-card__desc" data-product-field="description" />
              <p className="ta-card__price" data-product-field="price" />
              <button type="button" className="ta-card__add" data-product-add>Pedir servicio</button>
            </div>
          </article>
        </template>
        <div className="ta-grid" data-pagosya-catalog />
      </section>

      <section id="como" className="ta-how" aria-labelledby="ta-how-title">
        <Parallax strength={160} className="ta-drift ta-drift--deep"><img src={photos.herramientas} alt="" aria-hidden="true" /></Parallax>
        <Reveal><h2 id="ta-how-title" className="ta-title ta-title--light">Cómo trabajamos</h2></Reveal>
        <Reveal delay={80}><ol>{steps.map((step, index) => <li key={step.t}><span>0{index + 1}</span><h3>{step.t}</h3><p>{step.b}</p></li>)}</ol></Reveal>
      </section>

      <section id="equipo" className="ta-team" aria-labelledby="ta-team-title">
        <Reveal><img src={photos.equipo} alt="Nuestro equipo listo para salir" /></Reveal>
        <Reveal delay={80}>
          <p className="ta-kicker">Dónde llegamos</p>
          <h2 id="ta-team-title" className="ta-title">Cerca de tu casa</h2>
          <p>Nuestro equipo recorre la ciudad todos los días. Si tu zona no está, escríbenos igual.</p>
          <ul className="ta-zones">{zones.map(zone => <li key={zone}>{zone}</li>)}</ul>
        </Reveal>
      </section>

      <section id="preguntas" className="ta-faq" aria-labelledby="ta-faq-title">
        <Reveal><h2 id="ta-faq-title" className="ta-title">Preguntas</h2></Reveal>
        <div>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
