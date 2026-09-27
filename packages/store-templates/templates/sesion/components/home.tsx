import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const steps = [
  { t: 'Elige tu paquete', b: 'Retrato, pareja, producto o evento. Cada paquete dice qué incluye.' },
  { t: 'Conversamos', b: 'Te escribimos para entender qué quieres contar y elegir el lugar y la luz.' },
  { t: 'La sesión', b: 'Sin apuro. Te guiamos en cada foto para que te sientas cómodo.' },
  { t: 'Tus fotos', b: 'Editadas a mano, en alta resolución, en una galería privada.' },
];
const faqs = [
  { q: '¿Cuánto tardan las fotos?', a: 'Entre 7 y 14 días según el paquete. Te enviamos una vista previa antes.' },
  { q: '¿Puedo cambiar la fecha?', a: 'Sí, avísanos con 48 horas y reprogramamos sin costo.' },
  { q: '¿Viajan fuera de la ciudad?', a: 'Sí. Escríbenos y armamos un paquete a tu medida.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="se-hero">
        <div className="se-hero__copy">
          <p className="se-meta">Fotografía · Retrato · Eventos</p>
          <h1 className="se-display">Fotos que se <em>sienten.</em></h1>
          <p className="se-lead">Retratos, parejas y marcas, con luz natural y el tiempo que cada historia necesita.</p>
          <a className="se-link" href="#paquetes">Ver paquetes →</a>
        </div>
        <div className="se-hero__photo"><Parallax strength={60} mobileStrength={14} className="se-drift se-drift--deep"><img src={photos.hero} alt={`${store.name} en el estudio`} /></Parallax></div>
      </section>

      <section id="trabajos" className="se-work" aria-labelledby="se-work-title">
        <Reveal className="se-work__head"><h2 id="se-work-title" className="se-title">Trabajos recientes</h2><p className="se-meta">2024 — hoy</p></Reveal>
        <div className="se-mosaic">
          <Parallax strength={20} className="se-mosaic__a"><figure><img src={photos.p1} alt="Retrato con luz de ventana" /><figcaption className="se-meta">Retrato</figcaption></figure></Parallax>
          <Parallax strength={70} className="se-mosaic__b"><figure><img src={photos.obra} alt="Arquitectura con luz de tarde" /><figcaption className="se-meta">Arquitectura</figcaption></figure></Parallax>
          <Parallax strength={40} className="se-mosaic__c"><figure><img src={photos.p2} alt="Pareja caminando al atardecer" /><figcaption className="se-meta">Parejas</figcaption></figure></Parallax>
          <Parallax strength={90} className="se-mosaic__d"><figure><img src={photos.p3} alt="Bodegón de cerámicas" /><figcaption className="se-meta">Producto</figcaption></figure></Parallax>
        </div>
      </section>

      <section id="paquetes" className="se-shop" aria-labelledby="se-shop-title">
        <Reveal className="se-shop__head"><h2 id="se-shop-title" className="se-title">Paquetes</h2><p>Reserva tu sesión y coordinamos la fecha contigo.</p></Reveal>
        <template data-pagosya-product-template>
          <article className="se-card">
            <a className="se-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del paquete" /></a>
            <div className="se-card__body">
              <h3 className="se-card__name" data-product-field="name">Paquete</h3>
              <p className="se-card__desc" data-product-field="description" />
              <div className="se-card__row"><span className="se-card__price" data-product-field="price" /><button type="button" className="se-card__add" data-product-add>Reservar</button></div>
            </div>
          </article>
        </template>
        <div className="se-grid" data-pagosya-catalog />
      </section>

      <section id="estudio" className="se-studio" aria-labelledby="se-studio-title">
        <div className="se-studio__photo"><Parallax strength={40} className="se-drift se-drift--deep"><img src={photos.estudio} alt="El estudio" /></Parallax></div>
        <Reveal className="se-studio__copy">
          <h2 id="se-studio-title" className="se-title">Cómo trabajamos</h2>
          <ol>{steps.map((step, index) => <li key={step.t}><span className="se-meta">0{index + 1}</span><div><h3>{step.t}</h3><p>{step.b}</p></div></li>)}</ol>
        </Reveal>
      </section>

      <section id="preguntas" className="se-faq" aria-labelledby="se-faq-title">
        <Reveal><h2 id="se-faq-title" className="se-title">Preguntas</h2></Reveal>
        <div>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
