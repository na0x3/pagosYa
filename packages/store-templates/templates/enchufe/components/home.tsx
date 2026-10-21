import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { photos, copy } from './store-data';

const categories = [
  { slot: 'audio', name: copy.home_1, note: copy.home_2, alt: copy.home_3 },
  { slot: 'carga', name: copy.home_4, note: copy.home_5, alt: copy.home_6 },
  { slot: 'hogar', name: copy.home_7, note: copy.home_8, alt: copy.home_9 },
  { slot: 'accesorios', name: copy.home_10, note: copy.home_11, alt: copy.home_12 },
];

const earbuds = [
  { name: copy.home_13, note: copy.home_14 },
  { name: copy.home_15, note: copy.home_16, pick: true },
  { name: copy.home_17, note: copy.home_18 },
];

const specs = [
  { label: copy.home_19, values: ['20 h', '30 h', '36 h'] },
  { label: copy.home_20, values: [copy.home_21, copy.home_22, copy.home_23] },
  { label: copy.home_24, values: [copy.home_25, copy.home_26, copy.home_27] },
  { label: copy.home_28, values: [copy.home_29, copy.home_30, copy.home_31] },
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
  { icon: <ShieldIcon />, title: copy.home_32, text: copy.home_33 },
  { icon: <ChatIcon />, title: copy.home_34, text: copy.home_35 },
  { icon: <ReceiptIcon />, title: copy.home_36, text: copy.home_37 },
];

const questions = [
  { q: copy.home_38, a: copy.home_39 },
  { q: copy.home_40, a: copy.home_41 },
  { q: copy.home_42, a: copy.home_43 },
  { q: copy.home_44, a: copy.home_45 },
  { q: copy.home_46, a: copy.home_47 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="conectado" className="ec-hero" aria-labelledby="ec-hero-title">
        <div className="ec-hero__panel">
          <div className="ec-hero__product">
            <img src={photos.hero} alt={copy.home_48} />
          </div>
          <p className="ec-chip">{copy.home_49}</p>
          <h1 id="ec-hero-title" className="ec-hero__title">{copy.home_50}</h1>
          <p className="ec-hero__lead">{copy.home_51}</p>
          <a className="ec-btn ec-btn--purple" href="#mas-vendidos">{copy.home_52}</a>
        </div>
      </section>

      <section id="mas-vendidos" className="ec-shop" aria-labelledby="ec-shop-title">
        <div className="ec-panel">
          <Reveal className="ec-head">
            <h2 id="ec-shop-title" className="ec-title">{copy.home_53}</h2>
            <p className="ec-head__aside">{copy.home_54}</p>
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
          <h2 id="ec-cats-title" className="ec-title">{copy.home_55}</h2>
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
            <p className="ec-kicker">{copy.home_56}</p>
            <h2 id="ec-compare-title" className="ec-title">{copy.home_57}</h2>
            <p className="ec-compare__text">{copy.home_58}</p>
            <a className="ec-btn" href="#mas-vendidos">{copy.home_59}</a>
          </Reveal>
          <Reveal className="ec-table">
            <table>
              <caption className="ec-sr">{copy.home_60}</caption>
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
        <h2 id="ec-support-title" className="ec-sr">{copy.home_61}</h2>
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
          <Parallax strength={70} mobileStrength={26} className="ec-drift"><img src={photos.escritorio} alt={copy.home_62} /></Parallax>
        </div>
        <Reveal className="ec-desk__card">
          <p className="ec-kicker">{copy.home_63}</p>
          <h2 id="ec-desk-title" className="ec-desk__title">{copy.home_64}</h2>
          <p className="ec-desk__text">{copy.home_65}</p>
          <a className="ec-btn ec-btn--purple" href="#categorias">{copy.home_66}</a>
        </Reveal>
      </section>

      <section id="preguntas" className="ec-faq" aria-labelledby="ec-faq-title">
        <div className="ec-panel ec-faq__panel">
          <Reveal className="ec-faq__head">
            <h2 id="ec-faq-title" className="ec-title">{copy.home_67}</h2>
            <p className="ec-head__aside">{copy.home_68}</p>
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
