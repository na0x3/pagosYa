import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const process = [
  { title: 'La masa descansa', body: 'Sin apuro: el tiempo es el ingrediente que más se nota.' },
  { title: 'Horneamos temprano', body: 'Cada mañana, en tandas pequeñas.' },
  { title: 'Sale calentito', body: 'Directo a tu mesa o a tu pedido.' },
];
const faqs = [
  { q: '¿Puedo encargar para un evento?', a: 'Sí. Escríbenos con al menos 48 horas de anticipación y lo preparamos.' },
  { q: '¿Hasta qué hora reciben pedidos?', a: 'Los pedidos del día se preparan con lo horneado esa mañana, hasta agotar.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="mi-hero">
        <Parallax strength={50} mobileStrength={20}><figure className="mi-polaroid mi-polaroid--left"><img src={photos.izq} alt={`Horneado de ${store.name}`} /><figcaption>Recién salido</figcaption></figure></Parallax>
        <div className="mi-hero__copy">
          <p className="mi-badge">Horneado hoy</p>
          <h1 className="mi-display">Del horno a tu mesa</h1>
          <p className="mi-lead">Pan, masas y dulces hechos cada mañana. Pide lo tuyo antes de que se acabe.</p>
          <a className="mi-btn" href="#hoy">Ver lo de hoy</a>
        </div>
        <Parallax strength={-45} mobileStrength={-15}><figure className="mi-polaroid mi-polaroid--right"><img src={photos.der} alt="Café y algo dulce" /><figcaption>Para acompañar</figcaption></figure></Parallax>
      </section>

      <section id="hoy" className="mi-menu" aria-labelledby="mi-menu-title">
        <Reveal>
          <h2 id="mi-menu-title" className="mi-title">Recién horneado</h2>
          <p className="mi-sub">Lo que sale del horno hoy. Agrega y pasa a recoger o recíbelo en casa.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="mi-item">
            <a className="mi-item__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="mi-item__text">
              <div className="mi-item__row"><h3 className="mi-item__name" data-product-field="name">Producto</h3><span className="mi-item__dots" aria-hidden="true" /><span className="mi-item__price" data-product-field="price" /></div>
              <p className="mi-item__desc" data-product-field="description" />
            </div>
            <button type="button" className="mi-item__add" data-product-add aria-label="Agregar a la canasta">+</button>
          </article>
        </template>
        <div className="mi-list" data-pagosya-catalog />
      </section>

      <section id="cocina" className="mi-story" aria-labelledby="mi-story-title">
        <Reveal className="mi-story__photos"><img className="mi-story__a" src={photos.cocina} alt="Nuestra cocina" /><img className="mi-story__b" src={photos.masa} alt="Masa en preparación" /></Reveal>
        <Reveal delay={120}>
          <h2 id="mi-story-title" className="mi-title mi-title--left">Nuestra cocina</h2>
          <ol>{process.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        </Reveal>
      </section>

      <section id="pedidos" className="mi-order" aria-labelledby="mi-order-title">
        <Reveal>
          <h2 id="mi-order-title" className="mi-title">¿Una fiesta? ¿Una reunión?</h2>
          <p>Encárganos tortas, bandejas y cajas para regalar.</p>
        </Reveal>
        <details className="mi-faq"><summary>Preguntas frecuentes</summary>{faqs.map(item => <div key={item.q}><h3>{item.q}</h3><p>{item.a}</p></div>)}</details>
        <a className="mi-btn mi-btn--pink" href="#hoy">Hacer mi pedido</a>
      </section>
    </main>
  </Shell>;
}
