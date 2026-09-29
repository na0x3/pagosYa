import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const perks = [
  { name: 'Envío', text: 'A todo el país, con seguimiento.' },
  { name: 'Devolución', text: 'Cambios en 7 días sin complicaciones.' },
  { name: 'Pago seguro', text: 'QR y tarjeta, siempre protegidos.' },
  { name: 'Atención', text: 'Respondemos el mismo día.' },
];

const faqs = [
  { q: '¿Cuánto tarda el envío?', a: 'Entre 2 y 5 días hábiles según tu ciudad.' },
  { q: '¿Puedo cambiar mi pedido?', a: 'Sí, dentro de los 7 días con el producto sin usar.' },
  { q: '¿Cómo puedo pagar?', a: 'Con QR o tarjeta, desde la misma página.' },
  { q: '¿Hacen facturas?', a: 'Sí, indícalo al pagar y te la enviamos por correo.' },
];

const reviews = [
  { quote: 'Todo llegó bien empacado y tal como se ve en las fotos.', who: 'Sofía, La Paz' },
  { quote: 'La atención fue rápida y muy amable.', who: 'Marco, Cochabamba' },
  { quote: 'Calidad excelente. Ya hice un segundo pedido.', who: 'Elena, Santa Cruz' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="ne-hero" aria-labelledby="ne-hero-title">
        <Parallax strength={50} mobileStrength={20} className="ne-hero__bg"><img src={photos.p1} alt="Degradado suave azul y blanco con una ola de papel plegado" /></Parallax>
        <div className="ne-hero__copy">
          <h1 id="ne-hero-title" className="ne-hero__title">{store.name}: hecho para durar</h1>
          <p className="ne-hero__lead">Productos sencillos, bien pensados y enviados a tu casa.</p>
          <a className="ne-btn" href="#vendidos">Comprar ahora</a>
        </div>
      </section>

      <section id="vendidos" className="ne-shop" aria-labelledby="ne-shop-title">
        <Reveal className="ne-head">
          <h2 id="ne-shop-title" className="ne-title">Más vendidos</h2>
          <p className="ne-head__aside">Lo que más eligen nuestros clientes.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="ne-card">
            <a className="ne-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="ne-card__name" data-product-field="name">Producto</h3>
            <p className="ne-card__price" data-product-field="price" />
            <button type="button" className="ne-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="ne-grid" data-pagosya-catalog />
      </section>

      <section id="beneficios" className="ne-perks" aria-label="Beneficios">
        <div className="ne-perks__grid">
          {perks.map((perk, index) => <Reveal key={perk.name} delay={index * 50}>
            <div className="ne-perk"><b>{perk.name}</b><span>{perk.text}</span></div>
          </Reveal>)}
        </div>
      </section>

      <section id="destacado" className="ne-feat" aria-labelledby="ne-feat-title">
        <img className="ne-feat__photo" src={photos.p2} alt="Botella blanca minimalista sobre un fondo gris claro" />
        <Reveal className="ne-feat__copy">
          <p className="ne-kicker">Destacado</p>
          <h2 id="ne-feat-title" className="ne-title">Diseño sobrio, uso diario</h2>
          <p>Materiales resistentes y un acabado limpio que combina con todo. Pensado para acompañarte a diario sin llamar la atención.</p>
          <a className="ne-btn" href="#vendidos">Ver el catálogo</a>
        </Reveal>
      </section>

      <section id="historia" className="ne-story" aria-labelledby="ne-story-title">
        <img className="ne-story__photo" src={photos.equipo} alt="Pequeño equipo reunido alrededor de una mesa luminosa" />
        <Reveal className="ne-story__copy">
          <h2 id="ne-story-title" className="ne-title">Un equipo pequeño, cuidado en cada detalle</h2>
          <p>Elegimos, probamos y empacamos cada pedido nosotros mismos. Si algo no sale bien, lo arreglamos.</p>
          <img className="ne-story__parcel" src={photos.empaque} alt="Paquete de papel kraft atado con una cinta" />
        </Reveal>
      </section>

      <section id="preguntas" className="ne-faq" aria-labelledby="ne-faq-title">
        <Reveal className="ne-head">
          <h2 id="ne-faq-title" className="ne-title">Preguntas frecuentes</h2>
        </Reveal>
        <div className="ne-faq__list">
          {faqs.map(item => <details key={item.q} className="ne-faq__item"><summary>{item.q}</summary><p>{item.a}</p></details>)}
        </div>
      </section>

      <section id="resenas" className="ne-rev" aria-labelledby="ne-rev-title">
        <Reveal className="ne-head">
          <h2 id="ne-rev-title" className="ne-title">Lo que dicen</h2>
        </Reveal>
        <div className="ne-rev__grid">
          {reviews.map((rev, index) => <Reveal key={rev.who} delay={index * 60}>
            <figure className="ne-rev__item"><blockquote>{rev.quote}</blockquote><figcaption>{rev.who}</figcaption></figure>
          </Reveal>)}
        </div>
      </section>

      <section id="boletin" className="ne-news" aria-labelledby="ne-news-title" data-pagosya-subscribe-block>
        <Reveal className="ne-news__inner">
          <h2 id="ne-news-title" className="ne-news__title">Novedades y ofertas</h2>
          <p className="ne-news__text">Un correo de vez en cuando, con lo nuevo y lo mejor.</p>
          <button type="button" className="ne-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="ne-news__field">Tu correo electrónico</span>
            <span className="ne-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="ne-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
