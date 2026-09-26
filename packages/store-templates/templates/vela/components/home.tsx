import Shell from './Shell';
import { store, photos } from './store-data';

const notes = ['Cítricos', 'Florales', 'Amaderados', 'Especiados', 'Frescos'];
const ritual = [
  { title: 'Enciende', body: 'La primera vez, déjala encendida hasta que la cera se derrita de borde a borde.' },
  { title: 'Espera', body: 'En unos minutos el aroma llena el ambiente.' },
  { title: 'Disfruta', body: 'Apágala tapándola y corta la mecha antes de volver a encenderla.' },
];
const faqs = [
  { q: '¿Cuánto dura cada vela?', a: 'Cada ficha indica sus horas aproximadas de encendido.' },
  { q: '¿Hacen sets para regalo?', a: 'Sí. Elige tus aromas y déjanos una nota: lo enviamos listo para regalar.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="ve-hero">
        <div className="ve-hero__copy">
          <p className="ve-kicker">Hecho a mano, en tandas pequeñas</p>
          <h1 className="ve-display">Enciende <em>algo bonito</em></h1>
          <p className="ve-lead">Velas y aromas para que tu casa huela a ti.</p>
          <a className="ve-btn" href="#coleccion">Descubrir los aromas</a>
          <ul className="ve-notes" aria-label="Familias de aromas">{notes.map(note => <li key={note}>{note}</li>)}</ul>
        </div>
        <img className="ve-hero__photo" src={photos.hero} alt={`Vela de ${store.name}`} />
      </section>

      <section id="coleccion" className="ve-shop" aria-labelledby="ve-shop-title">
        <h2 id="ve-shop-title" className="ve-title">La colección</h2>
        <template data-pagosya-product-template>
          <article className="ve-card">
            <a className="ve-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="ve-card__name" data-product-field="name">Aroma</h3>
            <p className="ve-card__desc" data-product-field="description" />
            <div className="ve-card__row"><span className="ve-card__price" data-product-field="price" /><button type="button" className="ve-card__add" data-product-add>Agregar</button></div>
          </article>
        </template>
        <div className="ve-grid" data-pagosya-catalog />
      </section>

      <section id="ritual" className="ve-ritual" aria-labelledby="ve-ritual-title">
        <img src={photos.ritual} alt="Una vela encendida" />
        <div>
          <h2 id="ve-ritual-title" className="ve-title ve-title--light">El ritual</h2>
          <ol>{ritual.map((step, index) => <li key={step.title}><span>{['I', 'II', 'III'][index]}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        </div>
      </section>

      <section id="regalos" className="ve-gift" aria-labelledby="ve-gift-title">
        <div>
          <h2 id="ve-gift-title" className="ve-title ve-title--left">Un regalo que se enciende</h2>
          <p>Elige dos o tres aromas y los enviamos juntos, con tu nota.</p>
          <a className="ve-btn ve-btn--plum" href="#coleccion">Armar un regalo</a>
        </div>
        <img src={photos.regalo} alt="Set de regalo" />
      </section>

      <section id="preguntas" className="ve-faq" aria-labelledby="ve-faq-title">
        <h2 id="ve-faq-title" className="ve-title">Preguntas</h2>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
