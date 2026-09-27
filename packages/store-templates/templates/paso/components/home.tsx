import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const materials = [
  { t: 'Lana suave', b: 'Fresca en verano, abrigada en invierno. Sin medias, si quieres.' },
  { t: 'Suela natural', b: 'Liviana, flexible y con buen agarre para caminar todo el día.' },
  { t: 'Lavables', b: 'Plantillas fuera, lavarropas en frío y listas otra vez.' },
];
const faqs = [
  { q: '¿Qué talle elijo?', a: 'Tu talle de siempre. Si estás entre dos, elige el más grande.' },
  { q: '¿Puedo cambiarlas?', a: 'Sí, tienes 30 días para probarlas. Si no te convencen, las cambiamos.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta, desde tu celular.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="ps-hero">
        <div className="ps-hero__stage"><Parallax strength={60} mobileStrength={20} className="ps-drift"><img src={photos.hero} alt={`Zapatillas de ${store.name}`} /></Parallax></div>
        <div className="ps-hero__copy">
          <h1 className="ps-display">Las zapatillas más cómodas que vas a usar.</h1>
          <p className="ps-lead">Hechas con materiales naturales, para caminar la ciudad todo el día.</p>
          <div className="ps-actions"><a className="ps-btn" href="#tienda">Comprar ahora</a><a className="ps-btn ps-btn--ghost" href="#materiales">Materiales</a></div>
        </div>
      </section>

      <section id="tienda" className="ps-shop" aria-labelledby="ps-shop-title">
        <Reveal className="ps-shop__head"><h2 id="ps-shop-title" className="ps-title">Nuestros favoritos</h2><p>Colores tranquilos que combinan con todo.</p></Reveal>
        <template data-pagosya-product-template>
          <article className="ps-card">
            <a className="ps-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la zapatilla" /></a>
            <div className="ps-card__dots" aria-hidden="true"><span /><span /><span /></div>
            <h3 className="ps-card__name" data-product-field="name">Zapatilla</h3>
            <p className="ps-card__price" data-product-field="price" />
            <button type="button" className="ps-card__add" data-product-add>Agregar al carrito</button>
          </article>
        </template>
        <div className="ps-grid" data-pagosya-catalog />
      </section>

      <section id="materiales" className="ps-materials" aria-labelledby="ps-mat-title">
        <div className="ps-materials__photo"><Parallax strength={60} className="ps-drift ps-drift--deep"><img src={photos.material} alt="Fibras de lana de cerca" /></Parallax></div>
        <Reveal className="ps-materials__copy">
          <h2 id="ps-mat-title" className="ps-title">Hechas con cosas buenas</h2>
          <ul>{materials.map(item => <li key={item.t}><h3>{item.t}</h3><p>{item.b}</p></li>)}</ul>
        </Reveal>
      </section>

      <section id="caminar" className="ps-walk" aria-label="Caminando">
        <Parallax strength={80} className="ps-walk__photo"><img src={photos.caminar} alt="" aria-hidden="true" /></Parallax>
        <Reveal className="ps-walk__copy"><p className="ps-walk__line">Pensadas para caminar.<br />Y para no pensar en tus pies.</p><a className="ps-btn" href="#tienda">Elegir las mías</a></Reveal>
      </section>

      <section id="ayuda" className="ps-faq" aria-labelledby="ps-faq-title">
        <Reveal><h2 id="ps-faq-title" className="ps-title">Preguntas</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
