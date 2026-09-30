import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const numbers = [
  { value: '12', label: 'años construyendo' },
  { value: '240+', label: 'obras entregadas' },
  { value: '18.500', label: 'm² construidos' },
  { value: '190', label: 'familias felices' },
];

const steps = [
  { title: 'Visita', text: 'Vamos a tu terreno o casa, medimos y escuchamos lo que necesitas.' },
  { title: 'Presupuesto', text: 'Recibes un presupuesto por escrito, con materiales, plazos y precio final.' },
  { title: 'Obra', text: 'Un encargado fijo dirige el trabajo y te manda avances con fotos cada semana.' },
  { title: 'Entrega', text: 'Revisamos juntos cada detalle y te entregamos con garantía por escrito.' },
];

const reviews = [
  { quote: 'Nos entregaron la remodelación de la cocina una semana antes de lo prometido y sin dejar escombros.', name: 'Rosario', place: 'Sopocachi' },
  { quote: 'El presupuesto fue claro desde el primer día. Lo que nos dijeron que costaría fue lo que pagamos.', name: 'Marcelo', place: 'Equipetrol' },
  { quote: 'Construyeron la casa de mis padres con mucho cuidado. Cada semana mandaban fotos del avance.', name: 'Andrea', place: 'Cala Cala' },
];

const projects = [
  { slot: 'p4', name: 'Cocina integral', meta: '38 m² · 5 semanas · Achumani', alt: 'Cocina moderna terminada en tonos neutros' },
  { slot: 'p2', name: 'Losa y estructura', meta: '96 m² · 8 semanas · Cochabamba', alt: 'Encargado con casco revisando una losa de hormigón' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="ob-hero" aria-labelledby="ob-hero-title">
        <img className="ob-hero__photo" src={photos.p3} alt={`Obra de ${store.name}: muro de ladrillo en construcción`} />
        <div className="ob-hero__copy">
          <p className="ob-kicker">Construcción y remodelación</p>
          <h1 id="ob-hero-title" className="ob-hero__title">Construimos lo que imaginas</h1>
          <p className="ob-hero__lead">Visita técnica, presupuesto por escrito y una obra que se entrega en la fecha acordada.</p>
          <div className="ob-hero__actions">
            <a className="ob-btn ob-btn--yellow" href="#servicios">Cotizar mi obra</a>
            <a className="ob-btn ob-btn--ghost" href="#servicios">Ver servicios</a>
          </div>
        </div>
      </section>

      <section id="servicios" className="ob-shop" aria-labelledby="ob-shop-title">
        <Reveal className="ob-head">
          <h2 id="ob-shop-title" className="ob-title">Servicios y paquetes</h2>
          <p className="ob-head__aside">Elige un paquete, agrégalo a tu pedido y coordinamos la visita en 48 horas.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ob-card">
            <a className="ob-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del servicio" /></a>
            <div className="ob-card__body">
              <h3 className="ob-card__name" data-product-field="name">Servicio</h3>
              <p className="ob-card__price" data-product-field="price" />
              <button type="button" className="ob-card__add" data-product-add>Agregar</button>
            </div>
          </article>
        </template>
        <div className="ob-grid" data-pagosya-catalog />
      </section>

      <section id="cifras" className="ob-numbers" aria-label="Nuestra trayectoria en cifras">
        <ul className="ob-numbers__list">
          {numbers.map((item, index) => <li key={item.label}>
            <Reveal delay={index * 60}>
              <b className="ob-numbers__value">{item.value}</b>
              <span className="ob-numbers__label">{item.label}</span>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="proyectos" className="ob-projects" aria-labelledby="ob-projects-title">
        <Reveal className="ob-head">
          <h2 id="ob-projects-title" className="ob-title">Antes y después</h2>
          <p className="ob-head__aside">Algunas de las obras que entregamos este año.</p>
        </Reveal>
        <div className="ob-projects__grid">
          <Reveal className="ob-pair">
            <figure className="ob-pair__side">
              <img src={photos.antes} alt="Sala sin terminar, con paredes de hormigón y cables a la vista" />
              <figcaption>Antes</figcaption>
            </figure>
            <figure className="ob-pair__side">
              <img src={photos.despues} alt="La misma sala terminada, con paredes blancas y piso de madera" />
              <figcaption>Después</figcaption>
            </figure>
            <p className="ob-pair__caption"><b>Remodelación de sala</b> · 64 m² · 6 semanas · Calacoto</p>
          </Reveal>
          {projects.map((project, index) => <Reveal key={project.slot} delay={(index + 1) * 60} className="ob-project">
            <img src={photos[project.slot]} alt={project.alt} />
            <p className="ob-project__name">{project.name}</p>
            <p className="ob-project__meta">{project.meta}</p>
          </Reveal>)}
        </div>
      </section>

      <section id="proceso" className="ob-process" aria-labelledby="ob-process-title">
        <Parallax strength={70} mobileStrength={24} className="ob-drift"><img src={photos.p1} alt="" aria-hidden="true" /></Parallax>
        <div className="ob-process__inner">
          <Reveal className="ob-head">
            <h2 id="ob-process-title" className="ob-title ob-title--light">Así trabajamos</h2>
          </Reveal>
          <ol className="ob-steps">
            {steps.map((step, index) => <li key={step.title}>
              <Reveal delay={index * 60}>
                <span className="ob-steps__n">{String(index + 1).padStart(2, '0')}</span>
                <b className="ob-steps__title">{step.title}</b>
                <span className="ob-steps__text">{step.text}</span>
              </Reveal>
            </li>)}
          </ol>
        </div>
      </section>

      <section id="resenas" className="ob-reviews" aria-labelledby="ob-reviews-title">
        <Reveal className="ob-head">
          <h2 id="ob-reviews-title" className="ob-title">Lo que dicen nuestros clientes</h2>
        </Reveal>
        <div className="ob-quotes">
          {reviews.map((review, index) => <Reveal key={review.name} delay={index * 60}>
            <figure className="ob-quote">
              <p className="ob-quote__stars" aria-hidden="true">★★★★★</p>
              <blockquote className="ob-quote__text">{review.quote}</blockquote>
              <figcaption className="ob-quote__who"><b>{review.name}</b> · {review.place}</figcaption>
            </figure>
          </Reveal>)}
        </div>
      </section>

      <section id="cotizar" className="ob-cta" aria-labelledby="ob-cta-title">
        <Reveal className="ob-cta__inner">
          <h2 id="ob-cta-title" className="ob-cta__title">¿Listo para empezar tu obra?</h2>
          <p className="ob-cta__text">Elige el paquete que más se parece a lo que necesitas. Te llamamos para coordinar la visita técnica.</p>
          <a className="ob-btn ob-btn--dark" href="#servicios">Cotizar tu obra</a>
        </Reveal>
      </section>
    </main>
  </Shell>;
}
