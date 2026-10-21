import type { CSSProperties } from 'react';
import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos, copy } from './store-data';

/** The store name, one word per line, for the stacked hero title. */
const nameWords = store.name.split(/\s+/).filter(Boolean);
/** The longest word's length sizes the title so that word fits one line instead of breaking mid-word. */
const nameFit = { '--gr-fit': Math.max(4, ...nameWords.map(word => Array.from(word).length)) } as CSSProperties;

const promises = ['100% orgánico', copy.home_1, copy.home_2];

const care = [
  { slot: 'gallinas', title: copy.home_3, text: copy.home_4, alt: copy.home_5 },
  { slot: 'pasto', title: copy.home_6, text: copy.home_7, alt: copy.home_8 },
  { slot: 'recoleccion', title: copy.home_9, text: copy.home_10, alt: copy.home_11 },
];

const rounds = [
  { day: copy.home_12, zones: [copy.home_13, copy.home_14], cutoff: copy.home_15, tone: 'yolk' },
  { day: copy.home_16, zones: [copy.home_17, copy.home_18], cutoff: copy.home_19, tone: 'field' },
];

const faqs = [
  { q: copy.home_20, a: copy.home_21 },
  { q: copy.home_22, a: copy.home_23 },
  { q: copy.home_24, a: copy.home_25 },
  { q: copy.home_26, a: copy.home_27 },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="campo" className="gr-hero" aria-labelledby="gr-hero-title">
        <img className="gr-hero__photo" src={photos.hero} alt={copy.home_28} />
        <div className="gr-hero__inner">
          <p className="gr-hero__kicker">{copy.home_29}{store.city ? ` · ${store.city}` : ''}</p>
          <h1 id="gr-hero-title" className="gr-hero__title" style={nameFit}>{nameWords.map((word, index) => <span key={index} className="gr-hero__word">{word}{index < nameWords.length - 1 ? ' ' : ''}</span>)}</h1>
          <div className="gr-hero__foot">
            <p className="gr-hero__lead">{copy.home_30}</p>
            <a className="gr-btn gr-btn--yolk" href="#canasta">{copy.home_31}</a>
          </div>
        </div>
        <ul className="gr-strip" aria-label="Nuestra forma de criar">
          {promises.map(promise => <li key={promise}>{promise}</li>)}
        </ul>
      </section>

      <section id="canasta" className="gr-shop" aria-labelledby="gr-shop-title">
        <Reveal className="gr-head">
          <div>
            <p className="gr-kicker">{copy.home_32}</p>
            <h2 id="gr-shop-title" className="gr-title">{copy.home_33}</h2>
          </div>
          <p className="gr-head__aside">{copy.home_34}</p>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="gr-card">
            <a className="gr-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <div className="gr-card__body">
              <h3 className="gr-card__name" data-product-field="name">Producto</h3>
              <p className="gr-card__price" data-product-field="price" />
            </div>
            <button type="button" className="gr-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="gr-grid" data-pagosya-catalog />
      </section>

      <section id="como-criamos" className="gr-care" aria-labelledby="gr-care-title">
        <Reveal className="gr-head gr-head--light">
          <div>
            <p className="gr-kicker">{copy.home_35}</p>
            <h2 id="gr-care-title" className="gr-title">{copy.home_36}</h2>
          </div>
        </Reveal>
        <ol className="gr-care__list">
          {care.map((step, index) => <li key={step.slot}>
            <Reveal delay={index * 90} className="gr-step">
              <div className="gr-step__photo"><img src={photos[step.slot]} alt={step.alt} /></div>
              <p className="gr-step__n" aria-hidden="true">{String(index + 1).padStart(2, '0')}</p>
              <h3 className="gr-step__title">{step.title}</h3>
              <p className="gr-step__text">{step.text}</p>
            </Reveal>
          </li>)}
        </ol>
      </section>

      <section id="reparto" className="gr-rounds" aria-labelledby="gr-rounds-title">
        <Reveal className="gr-head">
          <div>
            <p className="gr-kicker">{copy.home_37}</p>
            <h2 id="gr-rounds-title" className="gr-title">{copy.home_38}</h2>
          </div>
          <p className="gr-head__aside">{copy.home_39}</p>
        </Reveal>
        <div className="gr-rounds__grid">
          {rounds.map((round, index) => <Reveal key={round.day} delay={index * 90} className={`gr-round gr-round--${round.tone}`}>
            <p className="gr-round__kicker">Día de reparto</p>
            <h3 className="gr-round__day">{round.day}</h3>
            <ul className="gr-round__zones">
              {round.zones.map(zone => <li key={zone}>{zone}</li>)}
            </ul>
            <p className="gr-round__cutoff">{round.cutoff}</p>
          </Reveal>)}
        </div>
      </section>

      <section id="visita" className="gr-visit" aria-labelledby="gr-visit-title">
        <div className="gr-visit__photo">
          <Parallax strength={70} mobileStrength={26} className="gr-drift"><img src={photos.granjero} alt={copy.home_40} /></Parallax>
        </div>
        <Reveal className="gr-visit__copy">
          <p className="gr-kicker">{copy.home_41}</p>
          <h2 id="gr-visit-title" className="gr-title">{copy.home_42}</h2>
          <p className="gr-visit__text">{copy.home_43}</p>
          <dl className="gr-facts">
            <div><dt>{copy.home_44}</dt><dd>{copy.home_45}</dd></div>
            <div><dt>{copy.home_46}</dt><dd>{copy.home_47}</dd></div>
            <div><dt>{copy.home_48}</dt><dd>{copy.home_49}</dd></div>
          </dl>
          <a className="gr-btn" href="#canasta">{copy.home_50}</a>
        </Reveal>
      </section>

      <section id="preguntas" className="gr-faq" aria-labelledby="gr-faq-title">
        <Reveal className="gr-faq__head">
          <p className="gr-kicker">{copy.home_51}</p>
          <h2 id="gr-faq-title" className="gr-title">{copy.home_52}</h2>
          <p className="gr-faq__note">{copy.home_53}{store.name}{copy.home_54}</p>
        </Reveal>
        <div className="gr-faq__list">
          {faqs.map(faq => <details key={faq.q} className="gr-qa">
            <summary className="gr-qa__q"><span>{faq.q}</span><span className="gr-qa__icon" aria-hidden="true" /></summary>
            <p className="gr-qa__a">{faq.a}</p>
          </details>)}
        </div>
      </section>
    </main>
  </Shell>;
}
