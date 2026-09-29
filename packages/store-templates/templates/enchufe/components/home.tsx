import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { photos } from './store-data';

const categories = [
  { slot: 'audio', name: 'Audio', note: 'Audífonos y parlantes', alt: 'Audífonos negros de diadema sobre fondo gris claro' },
  { slot: 'carga', name: 'Carga', note: 'Cargadores y baterías', alt: 'Batería portátil blanca junto a un cargador inalámbrico con un celular' },
  { slot: 'hogar', name: 'Hogar inteligente', note: 'Enchufes, luces y parlantes', alt: 'Parlante inteligente blanco junto a un interruptor inteligente' },
  { slot: 'accesorios', name: 'Accesorios', note: 'Cables, soportes y hubs', alt: 'Cable trenzado, soporte, hub USB-C y un reloj inteligente vistos desde arriba' },
];

const earbuds = [
  { name: 'Pulso Lite', note: 'Para el día a día' },
  { name: 'Pulso', note: 'El más elegido', pick: true },
  { name: 'Pulso Pro', note: 'Para viajar' },
];

const specs = [
  { label: 'Batería con estuche', values: ['20 h', '30 h', '36 h'] },
  { label: 'Cancelación de ruido', values: ['No', 'Básica', 'Activa adaptativa'] },
  { label: 'Resistencia al agua', values: ['IPX4', 'IPX5', 'IP55'] },
  { label: 'Precio', values: ['Bs 189', 'Bs 349', 'Bs 590'] },
];

function ShieldIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
}

function ChatIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20l1.4-4.2A8 8 0 1 1 8.3 18.7L4 20Z" /><path d="M9 10.5h6M9 13.5h4" /></svg>;
}

function ReceiptIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>;
}

const promises = [
  { icon: <ShieldIcon />, title: 'Garantía de 1 año', text: 'Si falla, lo cambiamos o lo reparamos sin vueltas.' },
  { icon: <ChatIcon />, title: 'Soporte por WhatsApp', text: 'Te ayudamos a configurarlo, de lunes a sábado.' },
  { icon: <ReceiptIcon />, title: 'Factura con NIT', text: 'Pídela al pagar y te llega junto con tu pedido.' },
];

const questions = [
  { q: '¿Hacen envíos a toda Bolivia?', a: 'Sí. Enviamos a las nueve capitales de departamento y a otras ciudades por courier. Desde Bs 500 el envío es gratis.' },
  { q: '¿Los cargadores sirven con los enchufes de Bolivia?', a: 'Sí. Todos nuestros cargadores y enchufes inteligentes funcionan con 220 V y con las tomas de dos patas redondas que se usan en casa.' },
  { q: '¿Cómo funciona la garantía?', a: 'Todos los productos tienen un año de garantía contra fallas de fábrica. Escríbenos por WhatsApp con tu número de pedido y lo resolvemos.' },
  { q: '¿Puedo pedir factura con NIT?', a: 'Claro. Al pagar, deja tu NIT o CI y la razón social, y te enviamos la factura con tu pedido.' },
  { q: '¿Cómo puedo pagar?', a: 'Con QR desde cualquier banco o con tarjeta de débito o crédito. El pago es seguro y se confirma al instante.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="conectado" className="ec-hero" aria-labelledby="ec-hero-title">
        <div className="ec-hero__panel">
          <div className="ec-hero__product">
            <img src={photos.hero} alt="Cámara compacta negra y plateada sobre fondo gris claro" />
          </div>
          <p className="ec-chip">Audio · Carga · Hogar inteligente</p>
          <h1 id="ec-hero-title" className="ec-hero__title">Tecnología útil. Precios justos.</h1>
          <p className="ec-hero__lead">Audífonos, cargadores y gadgets para la casa, elegidos por lo bien que funcionan.</p>
          <a className="ec-btn ec-btn--purple" href="#mas-vendidos">Ver lo más vendido</a>
        </div>
      </section>

      <section id="mas-vendidos" className="ec-shop" aria-labelledby="ec-shop-title">
        <div className="ec-panel">
          <Reveal className="ec-head">
            <h2 id="ec-shop-title" className="ec-title">Lo más vendido</h2>
            <p className="ec-head__aside">Lo que más se llevan esta semana, listo para enviar.</p>
          </Reveal>
          <template data-pagosya-product-template>
            <article className="ec-card">
              <a className="ec-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
              <div className="ec-card__body">
                <h3 className="ec-card__name" data-product-field="name">Producto</h3>
                <p className="ec-card__price" data-product-field="price" />
                <button type="button" className="ec-card__add" data-product-add>Agregar</button>
              </div>
            </article>
          </template>
          <div className="ec-rail" data-pagosya-catalog />
        </div>
      </section>

      <section id="categorias" className="ec-cats" aria-labelledby="ec-cats-title">
        <Reveal className="ec-head">
          <h2 id="ec-cats-title" className="ec-title">Compra por categoría</h2>
        </Reveal>
        <ul className="ec-cats__grid">
          {categories.map((cat, index) => <li key={cat.slot}>
            <Reveal delay={index * 50}>
              <a className="ec-tile" href="#mas-vendidos">
                <span className="ec-tile__media"><img src={photos[cat.slot]} alt={cat.alt} /></span>
                <span className="ec-tile__text"><span className="ec-tile__name">{cat.name}</span><span className="ec-tile__note">{cat.note}</span></span>
                <span className="ec-tile__go" aria-hidden="true">→</span>
              </a>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="comparar" className="ec-compare" aria-labelledby="ec-compare-title">
        <div className="ec-panel ec-compare__panel">
          <Reveal className="ec-compare__intro">
            <p className="ec-kicker">Audio</p>
            <h2 id="ec-compare-title" className="ec-title">¿Qué audífonos son para ti?</h2>
            <p className="ec-compare__text">Tres modelos inalámbricos, lado a lado. Todos traen estuche de carga con USB-C y un año de garantía.</p>
            <a className="ec-btn" href="#mas-vendidos">Ver audífonos</a>
          </Reveal>
          <Reveal className="ec-table">
            <table>
              <caption className="ec-sr">Comparación de tres audífonos inalámbricos</caption>
              <thead>
                <tr>
                  <td />
                  {earbuds.map(bud => <th key={bud.name} scope="col" className={bud.pick ? 'ec-table__pick' : undefined}>
                    <span className="ec-table__name">{bud.name}</span>
                    <span className="ec-table__note">{bud.note}</span>
                  </th>)}
                </tr>
              </thead>
              <tbody>
                {specs.map(row => <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {row.values.map((value, index) => <td key={earbuds[index].name} className={earbuds[index].pick ? 'ec-table__pick' : undefined}>{value}</td>)}
                </tr>)}
              </tbody>
            </table>
          </Reveal>
        </div>
      </section>

      <section id="soporte" className="ec-support" aria-labelledby="ec-support-title">
        <h2 id="ec-support-title" className="ec-sr">Compra con respaldo</h2>
        <ul className="ec-support__list">
          {promises.map((promise, index) => <li key={promise.title}>
            <Reveal delay={index * 50} className="ec-promise">
              <span className="ec-promise__icon">{promise.icon}</span>
              <span className="ec-promise__copy"><b>{promise.title}</b><span>{promise.text}</span></span>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="escritorio" className="ec-desk" aria-labelledby="ec-desk-title">
        <div className="ec-desk__photo">
          <Parallax strength={70} mobileStrength={26} className="ec-drift"><img src={photos.escritorio} alt="Escritorio de madera junto a la ventana con una laptop, teclado, audífonos y un cargador inalámbrico" /></Parallax>
        </div>
        <Reveal className="ec-desk__card">
          <p className="ec-kicker">Novedades</p>
          <h2 id="ec-desk-title" className="ec-desk__title">Un escritorio que trabaja contigo</h2>
          <p className="ec-desk__text">Carga inalámbrica, un hub para todo y audífonos que cortan el ruido. Menos cables, más espacio.</p>
          <a className="ec-btn ec-btn--purple" href="#categorias">Armar mi escritorio</a>
        </Reveal>
      </section>

      <section id="preguntas" className="ec-faq" aria-labelledby="ec-faq-title">
        <div className="ec-panel ec-faq__panel">
          <Reveal className="ec-faq__head">
            <h2 id="ec-faq-title" className="ec-title">Preguntas frecuentes</h2>
            <p className="ec-head__aside">¿Tienes otra duda? Escríbenos por WhatsApp y te respondemos el mismo día.</p>
          </Reveal>
          <div className="ec-faq__list">
            {questions.map(item => <details key={item.q} className="ec-faq__item">
              <summary>{item.q}<span className="ec-faq__plus" aria-hidden="true" /></summary>
              <p>{item.a}</p>
            </details>)}
          </div>
        </div>
      </section>
    </main>
  </Shell>;
}
