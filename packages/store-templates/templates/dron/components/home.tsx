import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const callouts = [
  { label: 'Autonomía', value: '45 min', text: 'De vuelo continuo con una sola batería.' },
  { label: 'Alcance', value: '12 km', text: 'Señal estable, incluso entre montañas.' },
  { label: 'Cámara', value: '8K', text: 'Sensor estabilizado en tres ejes.' },
];

const specs = [
  { row: 'Peso', a: '249 g', b: '895 g' },
  { row: 'Autonomía', a: '31 min', b: '45 min' },
  { row: 'Alcance', a: '8 km', b: '12 km' },
  { row: 'Video', a: '4K / 60', b: '8K / 30' },
];

const accessories = [
  { name: 'Baterías', text: 'Ciclos largos y carga rápida.' },
  { name: 'Hélices', text: 'Repuestos de bajo ruido.' },
  { name: 'Estuches', text: 'Rígidos y resistentes al agua.' },
  { name: 'Filtros', text: 'ND para luz intensa.' },
];

const rules = [
  { n: '01', title: 'Registra tu dron', text: 'Consulta con la autoridad aeronáutica de tu país antes del primer vuelo.' },
  { n: '02', title: 'Mantén la vista', text: 'Vuela siempre con el dron a la vista y lejos de aeropuertos.' },
  { n: '03', title: 'Respeta a las personas', text: 'No sobrevueles multitudes ni propiedades privadas sin permiso.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="dr-hero" aria-labelledby="dr-hero-title">
        <Parallax strength={60} mobileStrength={20} className="dr-hero__bg"><img src={photos.p1} alt="Ladera verde de los Andes bajo nubes suaves con picos lejanos" /></Parallax>
        <div className="dr-hero__cross" aria-hidden="true"><span /><span /></div>
        <p className="dr-hero__coords" aria-hidden="true">LAT 16.4990° S · LON 68.1193° W · ALT 3 640 m</p>
        <h1 id="dr-hero-title" className="dr-hero__title">Desafía el horizonte</h1>
        <div className="dr-hero__foot">
          <p className="dr-hero__lead">Drones de grado aeroespacial, estabilidad y 8K.</p>
          <a className="dr-btn" href="#modelos">Comprar ahora →</a>
        </div>
        <img className="dr-hero__inset" src={photos.p2} alt="Dron plegable gris sobre fondo blanco" />
      </section>

      <section id="modelos" className="dr-shop" aria-labelledby="dr-shop-title">
        <Reveal className="dr-head">
          <h2 id="dr-shop-title" className="dr-title">Modelos</h2>
          <p className="dr-head__aside">{store.name} · elige el dron para tu próximo vuelo.</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="dr-card">
            <a className="dr-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="dr-card__name" data-product-field="name">Producto</h3>
            <p className="dr-card__price" data-product-field="price" />
            <button type="button" className="dr-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="dr-grid" data-pagosya-catalog />
      </section>

      <section id="vuelo" className="dr-flight" aria-labelledby="dr-flight-title">
        <Parallax strength={60} mobileStrength={20} className="dr-flight__bg"><img src={photos.p3} alt="Dron flotando sobre un valle con lago al amanecer" /></Parallax>
        <h2 id="dr-flight-title" className="dr-flight__title">Hecho para volar lejos</h2>
        <ul className="dr-flight__list">
          {callouts.map((item, index) => <li key={item.label}>
            <Reveal delay={index * 60}>
              <span className="dr-flight__label">{item.label}</span>
              <b className="dr-flight__value">{item.value}</b>
              <span className="dr-flight__text">{item.text}</span>
            </Reveal>
          </li>)}
        </ul>
      </section>

      <section id="especificaciones" className="dr-specs" aria-labelledby="dr-specs-title">
        <Reveal className="dr-head">
          <h2 id="dr-specs-title" className="dr-title">Compara modelos</h2>
        </Reveal>
        <table className="dr-specs__table">
          <thead><tr><th scope="col">Especificación</th><th scope="col">Explorer</th><th scope="col">Pro</th></tr></thead>
          <tbody>
            {specs.map(spec => <tr key={spec.row}><th scope="row">{spec.row}</th><td>{spec.a}</td><td>{spec.b}</td></tr>)}
          </tbody>
        </table>
      </section>

      <section id="accesorios" className="dr-acc" aria-labelledby="dr-acc-title">
        <Reveal className="dr-head">
          <h2 id="dr-acc-title" className="dr-title">Accesorios</h2>
        </Reveal>
        <div className="dr-acc__grid">
          <img className="dr-acc__photo" src={photos.p4} alt="Batería de dron y cargador compacto sobre fondo blanco" />
          {accessories.map((item, index) => <Reveal key={item.name} delay={index * 50}>
            <a className="dr-acc__tile" href="#modelos"><b>{item.name}</b><span>{item.text}</span></a>
          </Reveal>)}
        </div>
      </section>

      <section id="licencia" className="dr-rules" aria-labelledby="dr-rules-title">
        <div className="dr-rules__photos">
          <img src={photos.campo} alt="Piloto de dron con control remoto sobre una colina" />
          <img className="dr-rules__small" src={photos.control} alt="Manos sosteniendo un control remoto de dron" />
        </div>
        <Reveal className="dr-rules__copy">
          <h2 id="dr-rules-title" className="dr-title">Antes de volar</h2>
          <ol className="dr-rules__list">
            {rules.map(rule => <li key={rule.n}><span className="dr-rules__n">{rule.n}</span><span><b>{rule.title}</b><br />{rule.text}</span></li>)}
          </ol>
        </Reveal>
      </section>

      <section id="boletin" className="dr-news" aria-labelledby="dr-news-title" data-pagosya-subscribe-block>
        <Reveal className="dr-news__inner">
          <h2 id="dr-news-title" className="dr-news__title">Novedades de vuelo</h2>
          <p className="dr-news__text">Lanzamientos, guías y rutas para volar, en tu correo.</p>
          <button type="button" className="dr-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="dr-news__field">Tu correo electrónico</span>
            <span className="dr-news__submit">Suscribirme</span>
          </button>
          <p role="status" className="dr-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
