import Shell from './Shell';
import { store, photos } from './store-data';

const perks = ['Para antes o después de entrenar', 'Sabores que dan ganas', 'Fácil de preparar'];
const steps = [
  { title: 'Mezcla', body: 'Una medida con agua o leche en tu shaker.' },
  { title: 'Agita', body: 'Diez segundos y listo, sin grumos.' },
  { title: 'Entrena', body: 'Tómalo en tu rutina, cuando te sirva a ti.' },
];
const faqs = [
  { q: '¿Cuándo lo tomo?', a: 'Cada producto indica su modo de uso en la ficha. Si tienes dudas, consulta con tu profesional de salud.' },
  { q: '¿Cuánto tarda el envío?', a: 'Despachamos en 24 a 48 horas hábiles y te avisamos cuando sale.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="ri-hero">
        <div className="ri-hero__copy">
          <h1 className="ri-display">Entrena<br /><span>más</span> fuerte</h1>
          <ul className="ri-perks">{perks.map(perk => <li key={perk}>{perk}</li>)}</ul>
          <a className="ri-btn" href="#productos">Comprar ahora</a>
        </div>
        <div className="ri-hero__product"><img src={photos.hero} alt={`Producto de ${store.name}`} /></div>
      </section>

      <section id="productos" className="ri-shop" aria-labelledby="ri-shop-title">
        <h2 id="ri-shop-title" className="ri-title">Elige tu sabor</h2>
        <template data-pagosya-product-template>
          <article className="ri-card">
            <a className="ri-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="ri-card__band" aria-hidden="true" />
            <h3 className="ri-card__name" data-product-field="name">Producto</h3>
            <p className="ri-card__desc" data-product-field="description" />
            <div className="ri-card__row"><span className="ri-card__price" data-product-field="price" /><button type="button" className="ri-card__add" data-product-add>Agregar</button></div>
          </article>
        </template>
        <div className="ri-grid" data-pagosya-catalog />
      </section>

      <section id="uso" className="ri-use" aria-labelledby="ri-use-title">
        <img src={photos.accion} alt="Entrenamiento" />
        <div>
          <h2 id="ri-use-title" className="ri-title ri-title--left">Así de simple</h2>
          <ol>{steps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        </div>
      </section>

      <section id="preguntas" className="ri-faq" aria-labelledby="ri-faq-title">
        <h2 id="ri-faq-title" className="ri-title">Preguntas</h2>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
