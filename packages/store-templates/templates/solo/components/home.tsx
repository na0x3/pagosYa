import Shell from './Shell';
import { store, photos } from './store-data';

const trust = ['Pago seguro con QR o tarjeta', 'Envío a todo el país', 'Cambios sin complicaciones'];
const benefits = [
  { title: 'Hecho para el día a día', body: 'Pensado para usarse mucho, no para quedarse guardado.' },
  { title: 'Simple de usar', body: 'Sin instrucciones largas: lo abres y funciona.' },
  { title: 'Te acompañamos', body: 'Si tienes una duda antes o después de comprar, te respondemos.' },
];
const steps = [
  { title: 'Elige', body: 'Selecciona la opción que prefieras y agrégala al carrito.' },
  { title: 'Paga', body: 'Con QR de cualquier banco o con tarjeta, en segundos.' },
  { title: 'Disfruta', body: 'Te lo enviamos y te avisamos en cada paso.' },
];
const faqs = [
  { q: '¿Cuánto tarda en llegar?', a: 'Despachamos en 24 a 48 horas hábiles y te avisamos cuando sale tu pedido.' },
  { q: '¿Y si no me convence?', a: 'Escríbenos dentro de los 7 días de recibido y buscamos una solución.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="comprar" className="so-hero">
        <div className="so-gallery">
          <img className="so-gallery__main" src={photos.hero} alt={`Producto de ${store.name}`} />
          <div className="so-gallery__thumbs"><img src={photos.vista2} alt="Otra vista del producto" /><img src={photos.vista3} alt="El producto en su caja" /><img src={photos.vista4} alt="Detalle del producto" /></div>
        </div>
        <div className="so-buy">
          <p className="so-eyebrow">{store.name}</p>
          <h1 className="so-h1">{store.tagline || 'El que vas a querer usar todos los días'}</h1>
          <template data-pagosya-product-template>
            <article className="so-box">
              <h2 className="so-box__name" data-product-field="name">Producto</h2>
              <p className="so-box__desc" data-product-field="description" />
              <p className="so-box__options" data-product-field="options" />
              <p className="so-box__price" data-product-field="price" />
              <button type="button" className="so-box__add" data-product-add>Agregar al carrito</button>
              <a className="so-box__more" data-product-link href="product.html">Ver todos los detalles</a>
            </article>
          </template>
          <div className="so-offers" data-pagosya-catalog />
          <ul className="so-trust">{trust.map(item => <li key={item}>{item}</li>)}</ul>
        </div>
      </section>

      <section id="beneficios" className="so-benefits" aria-labelledby="so-benefits-title">
        <h2 id="so-benefits-title" className="so-title">Por qué te va a gustar</h2>
        <ul>{benefits.map((item, index) => <li key={item.title}><span aria-hidden="true">{['◐', '◆', '●'][index]}</span><h3>{item.title}</h3><p>{item.body}</p></li>)}</ul>
      </section>

      <section id="uso" className="so-how" aria-labelledby="so-how-title">
        <img src={photos.uso} alt="El producto en uso" />
        <div>
          <h2 id="so-how-title" className="so-title so-title--left">Así de fácil</h2>
          <ol>{steps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        </div>
      </section>

      <section id="preguntas" className="so-faq" aria-labelledby="so-faq-title">
        <h2 id="so-faq-title" className="so-title">Preguntas</h2>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>

      <section className="so-cta" aria-labelledby="so-cta-title">
        <h2 id="so-cta-title">¿Listo para probarlo?</h2>
        <a className="so-btn" href="#comprar">Comprar ahora</a>
      </section>
    </main>
  </Shell>;
}
