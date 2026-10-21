import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

const steps = [
  { t: copy.home_1, b: copy.home_2 },
  { t: copy.home_3, b: copy.home_4 },
  { t: copy.home_5, b: copy.home_6 },
  { t: copy.home_7, b: copy.home_8 },
];
const faqs = [
  { q: copy.home_9, a: copy.home_10 },
  { q: copy.home_11, a: copy.home_12 },
  { q: copy.home_13, a: copy.home_14 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className="se-hero">
        <div className="se-hero__copy">
          <p className="se-meta">{copy.home_15}</p>
          <h1 className="se-display">{copy.home_16}<em>{copy.home_17}</em></h1>
          <p className="se-lead">{copy.home_18}</p>
          <a className="se-link" href="#paquetes">{copy.home_19}</a>
        </div>
        <div className="se-hero__photo"><Parallax strength={60} mobileStrength={14} className="se-drift se-drift--deep"><img src={photos.hero} alt={`${store.name} en el estudio`} /></Parallax></div>
      </section>

      <section id="trabajos" className="se-work" aria-labelledby="se-work-title">
        <Reveal className="se-work__head"><h2 id="se-work-title" className="se-title">{copy.home_20}</h2><p className="se-meta">2024 — hoy</p></Reveal>
        <div className="se-mosaic">
          <Parallax strength={20} className="se-mosaic__a"><figure><img src={photos.p1} alt={copy.home_21} /><figcaption className="se-meta">{copy.home_22}</figcaption></figure></Parallax>
          <Parallax strength={70} className="se-mosaic__b"><figure><img src={photos.obra} alt={copy.home_23} /><figcaption className="se-meta">{copy.home_24}</figcaption></figure></Parallax>
          <Parallax strength={40} className="se-mosaic__c"><figure><img src={photos.p2} alt={copy.home_25} /><figcaption className="se-meta">{copy.home_26}</figcaption></figure></Parallax>
          <Parallax strength={90} className="se-mosaic__d"><figure><img src={photos.p3} alt={copy.home_27} /><figcaption className="se-meta">{copy.home_28}</figcaption></figure></Parallax>
        </div>
      </section>

      <section id="paquetes" className="se-shop" aria-labelledby="se-shop-title">
        <Reveal className="se-shop__head"><h2 id="se-shop-title" className="se-title">{copy.home_29}</h2><p>{copy.home_30}</p></Reveal>
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
        <div className="se-studio__photo"><Parallax strength={40} className="se-drift se-drift--deep"><img src={photos.estudio} alt={copy.home_31} /></Parallax></div>
        <Reveal className="se-studio__copy">
          <h2 id="se-studio-title" className="se-title">{copy.home_32}</h2>
          <ol>{steps.map((step, index) => <li key={step.t}><span className="se-meta">0{index + 1}</span><div><h3>{step.t}</h3><p>{step.b}</p></div></li>)}</ol>
        </Reveal>
      </section>

      <section id="preguntas" className="se-faq" aria-labelledby="se-faq-title">
        <Reveal><h2 id="se-faq-title" className="se-title">{copy.home_33}</h2></Reveal>
        <div>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main>
  </Shell>;
}
