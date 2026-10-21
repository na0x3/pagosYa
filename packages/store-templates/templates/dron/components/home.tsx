import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const callouts = [
  { label: copy.home_1, value: '45 min', text: copy.home_2 },
  { label: copy.home_3, value: '12 km', text: copy.home_4 },
  { label: copy.home_5, value: '8K', text: copy.home_6 },
];

const specs = [
  { row: copy.home_7, a: '249 g', b: '895 g' },
  { row: copy.home_8, a: '31 min', b: '45 min' },
  { row: copy.home_9, a: '8 km', b: '12 km' },
  { row: copy.home_10, a: '4K / 60', b: '8K / 30' },
];

const accessories = [
  { name: copy.home_11, text: copy.home_12 },
  { name: copy.home_13, text: copy.home_14 },
  { name: copy.home_15, text: copy.home_16 },
  { name: copy.home_17, text: copy.home_18 },
];

const rules = [
  { n: '01', title: copy.home_19, text: copy.home_20 },
  { n: '02', title: copy.home_21, text: copy.home_22 },
  { n: '03', title: copy.home_23, text: copy.home_24 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="portada" className="dr-hero" aria-labelledby="dr-hero-title">
        <Parallax strength={60} mobileStrength={20} className="dr-hero__bg"><img src={photos.p1} alt={copy.home_25} /></Parallax>
        <div className="dr-hero__cross" aria-hidden="true"><span /><span /></div>
        <p className="dr-hero__coords" aria-hidden="true">{copy.home_26}</p>
        <h1 id="dr-hero-title" className="dr-hero__title">{copy.home_27}</h1>
        <div className="dr-hero__foot">
          <p className="dr-hero__lead">{copy.home_28}</p>
          <a className="dr-btn" href="#modelos">{copy.home_29}</a>
        </div>
        <img className="dr-hero__inset" src={photos.p2} alt={copy.home_30} />
      </section>

      <section id="modelos" className="dr-shop" aria-labelledby="dr-shop-title">
        <Reveal className="dr-head">
          <h2 id="dr-shop-title" className="dr-title">{copy.home_31}</h2>
          <p className="dr-head__aside">{store.name}{copy.home_32}</p>
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
        <Parallax strength={60} mobileStrength={20} className="dr-flight__bg"><img src={photos.p3} alt={copy.home_33} /></Parallax>
        <h2 id="dr-flight-title" className="dr-flight__title">{copy.home_34}</h2>
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
          <h2 id="dr-specs-title" className="dr-title">{copy.home_35}</h2>
        </Reveal>
        <table className="dr-specs__table">
          <thead><tr><th scope="col">{copy.home_36}</th><th scope="col">{copy.home_37}</th><th scope="col">{copy.home_38}</th></tr></thead>
          <tbody>
            {specs.map(spec => <tr key={spec.row}><th scope="row">{spec.row}</th><td>{spec.a}</td><td>{spec.b}</td></tr>)}
          </tbody>
        </table>
      </section>

      <section id="accesorios" className="dr-acc" aria-labelledby="dr-acc-title">
        <Reveal className="dr-head">
          <h2 id="dr-acc-title" className="dr-title">{copy.home_39}</h2>
        </Reveal>
        <div className="dr-acc__grid">
          <img className="dr-acc__photo" src={photos.p4} alt={copy.home_40} />
          {accessories.map((item, index) => <Reveal key={item.name} delay={index * 50}>
            <a className="dr-acc__tile" href="#modelos"><b>{item.name}</b><span>{item.text}</span></a>
          </Reveal>)}
        </div>
      </section>

      <section id="licencia" className="dr-rules" aria-labelledby="dr-rules-title">
        <div className="dr-rules__photos">
          <img src={photos.campo} alt={copy.home_41} />
          <img className="dr-rules__small" src={photos.control} alt={copy.home_42} />
        </div>
        <Reveal className="dr-rules__copy">
          <h2 id="dr-rules-title" className="dr-title">{copy.home_43}</h2>
          <ol className="dr-rules__list">
            {rules.map(rule => <li key={rule.n}><span className="dr-rules__n">{rule.n}</span><span><b>{rule.title}</b><br />{rule.text}</span></li>)}
          </ol>
        </Reveal>
      </section>

      <section id="boletin" className="dr-news" aria-labelledby="dr-news-title" data-pagosya-subscribe-block>
        <Reveal className="dr-news__inner">
          <h2 id="dr-news-title" className="dr-news__title">{copy.home_44}</h2>
          <p className="dr-news__text">{copy.home_45}</p>
          <button type="button" className="dr-news__button" data-pagosya-subscribe-open aria-label="Suscribirme con mi correo">
            <span className="dr-news__field">{copy.home_46}</span>
            <span className="dr-news__submit">{copy.home_47}</span>
          </button>
          <p role="status" className="dr-news__status" />
        </Reveal>
      </section>
    </main>
  </Shell>;
}
