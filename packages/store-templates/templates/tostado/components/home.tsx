import Shell from './Shell';
import { store, photos } from './store-data';

const steps = [
  { title: 'Seleccionamos', body: 'Probamos cada lote y elegimos los que tienen algo que contar.' },
  { title: 'Tostamos', body: 'En tandas pequeñas, cada semana, para que llegue fresco.' },
  { title: 'Enviamos', body: 'Molido o en grano, como lo prepares en casa.' },
];
const faqs = [
  { q: '¿En grano o molido?', a: 'Como prefieras. Si no tienes molino, te lo molemos para tu método: prensa, filtro o espresso.' },
  { q: '¿Cuándo tuestan?', a: 'Cada semana. Tu café sale entre 2 y 7 días después de tostado.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta, desde tu celular.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="tv-hero">
        <div className="tv-hero__copy">
          <p className="tv-kicker">Café de especialidad</p>
          <h1 className="tv-display">Café que vale la pena despertarse</h1>
          <p className="tv-lead">Granos seleccionados, tostados cada semana y enviados a tu puerta. Elige el tuyo.</p>
          <a className="tv-btn" href="#cafes">Comprar café</a>
        </div>
        <img className="tv-hero__photo" src={photos.hero} alt={`Café de ${store.name}`} />
      </section>

      <section id="cafes" className="tv-row" aria-labelledby="tv-cafes">
        <div className="tv-row__intro">
          <h2 id="tv-cafes" className="tv-title">Nuestros cafés</h2>
          <p>Cada uno con su origen y su perfil. Desliza para verlos todos.</p>
          <a className="tv-btn tv-btn--small" href="#cafes-lista">Ver todos</a>
        </div>
        <div className="tv-rail" id="cafes-lista">
          <template data-pagosya-product-template>
            <article className="tv-card">
              <a className="tv-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /><span className="tv-card__badge">Favorito</span></a>
              <h3 className="tv-card__name" data-product-field="name">Café</h3>
              <p className="tv-card__notes" data-product-field="description" />
              <div className="tv-card__foot"><span className="tv-card__price" data-product-field="price" /><button type="button" className="tv-card__add" data-product-add>Agregar</button></div>
            </article>
          </template>
          <div className="tv-rail__track" data-pagosya-catalog />
        </div>
      </section>

      <section id="origen" className="tv-split" aria-labelledby="tv-origen">
        <div className="tv-split__copy">
          <p className="tv-kicker">Del origen a tu taza</p>
          <h2 id="tv-origen" className="tv-title">Así llega tu café</h2>
          <ol className="tv-steps">{steps.map((step, index) => <li key={step.title}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        </div>
        <img className="tv-split__photo" src={photos.origen} alt="Origen del café" />
      </section>

      <section id="suscripcion" className="tv-sub" aria-labelledby="tv-sub">
        <img src={photos.taza} alt="" aria-hidden="true" />
        <div>
          <h2 id="tv-sub" className="tv-title">Nunca te quedes sin café</h2>
          <p>Pídenos tu café de siempre cada vez que se te acabe. Lo tostamos y te lo enviamos esa misma semana.</p>
          <a className="tv-btn" href="#cafes">Elegir mi café</a>
        </div>
      </section>

      <section id="preguntas" className="tv-faq" aria-labelledby="tv-faq">
        <h2 id="tv-faq" className="tv-title">Preguntas</h2>
        <div>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
