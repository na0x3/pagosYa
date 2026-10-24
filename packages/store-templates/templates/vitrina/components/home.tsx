import { useState } from 'react';
import { Reveal } from '@pagosya/ui';
import Shell from './Shell';
import HeroCard from './HeroCard';
import { photos, copy } from './store-data';
import { IconCheck, IconPlus, IconShoppingBag, IconStar } from './icons';

const marqueeLine = 'HECHO EN PEQUEÑAS TANDAS · SABOR CON CARÁCTER · PIDE HOY · CON TODO EL GUSTO';

export default function Home() {
  const [paused, setPaused] = useState(false);
  return <Shell>
    <main id="contenido">
      <section id="opening" className="vt-opening" aria-labelledby="opening-title">
        <div className="vt-opening__copy">
          <p className="vt-kicker">{copy.home_1}</p>
          <h1 id="opening-title">{copy.home_2}<span>{copy.home_3}</span></h1>
          <p className="vt-opening__lead">{copy.home_4}</p>
          <a className="es-btn vt-opening__cta" href="#catalog" data-track="hero-cta">{copy.home_5}</a>
        </div>
        <HeroCard />
      </section>

      <section id="trust-strip" className="vt-trust" aria-label="Cómo comprar">
        <div><IconShoppingBag /><span><strong>{copy.home_6}</strong><small>{copy.home_7}</small></span></div>
        <div><IconCheck /><span><strong>{copy.home_8}</strong><small>{copy.home_9}</small></span></div>
        <div><IconStar /><span><strong>{copy.home_10}</strong><small>{copy.home_11}</small></span></div>
      </section>

      <section id="marquee" className={paused ? 'vt-marquee is-paused' : 'vt-marquee'} aria-label="Nuestra voz">
        <div className="vt-marquee__viewport" tabIndex={0} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
          <p className="vt-marquee__track"><span>{marqueeLine}</span><span aria-hidden="true">{marqueeLine}</span></p>
        </div>
        <button type="button" className="vt-marquee__control" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? copy.home_12 : copy.home_13}</button>
      </section>

      <section id="catalog" className="vt-catalog" aria-labelledby="catalog-title">
        <Reveal className="vt-section-head"><div><p className="vt-kicker">{copy.home_14}</p><h2 id="catalog-title">{copy.home_15}</h2></div><p>{copy.home_16}</p></Reveal>
        <template data-pagosya-product-template>
          <article className="vt-card">
            <a className="vt-card__media" data-product-link href="product.html" data-track="card"><img data-product-field="image" alt="Foto del producto" /><span className="vt-card__chip" aria-hidden="true" /></a>
            <div className="vt-card__body"><h3 className="vt-card__name" data-product-field="name">Producto</h3><p className="vt-card__line" aria-hidden="true" /><div className="vt-card__buy"><p className="vt-card__price" data-product-field="price" /><button type="button" className="vt-card__add" data-product-add data-track="add"><IconPlus /> Añadir a Mi pedido</button></div></div>
          </article>
        </template>
        <div className="vt-grid" data-pagosya-catalog />
      </section>

      <section id="loyalty" className="vt-loyalty" aria-labelledby="loyalty-title">
        <Reveal className="vt-loyalty__copy"><p className="vt-kicker">{copy.home_17}</p><h2 id="loyalty-title">{copy.home_18}</h2><p>{copy.home_19}</p><a className="es-btn" href="#catalog" data-track="nav-catalog">{copy.home_20}</a></Reveal>
        <Reveal className="vt-loyalty__media" delay={80}>{photos.p1 ? <img src={photos.p1} alt={copy.home_21} loading="lazy" /> : null}</Reveal>
      </section>

      <section id="nosotros" className="vt-about vt-anchor" aria-labelledby="nosotros-title">
        <div className="vt-about__media">{photos.story ? <img src={photos.story} alt={copy.home_22} loading="lazy" /> : null}</div>
        <div className="vt-about__copy"><p className="vt-kicker">{copy.home_23}</p><h2 id="nosotros-title">{copy.home_24}</h2><p>{copy.home_25}</p><a className="es-btn" href="#catalog" data-track="nav-catalog">{copy.home_26}</a></div>
      </section>

      <section id="como-pedir" className="vt-how vt-anchor" aria-labelledby="como-pedir-title">
        <div className="vt-info-head"><p className="vt-kicker">{copy.home_27}</p><h2 id="como-pedir-title">{copy.home_28}</h2></div>
        <ol className="vt-steps">
          <li className="vt-step"><span>01</span><div><h3>{copy.home_29}</h3><p>{copy.home_30}</p></div></li>
          <li className="vt-step"><span>02</span><div><h3>{copy.home_31}</h3><p>{copy.home_32}</p></div></li>
          <li className="vt-step"><span>03</span><div><h3>{copy.home_33}</h3><p>{copy.home_34}</p></div></li>
        </ol>
      </section>

      <section id="preguntas" className="vt-faq vt-anchor" aria-labelledby="preguntas-title">
        <div className="vt-info-head"><p className="vt-kicker">{copy.home_35}</p><h2 id="preguntas-title">{copy.home_36}</h2></div>
        <div className="vt-faq__list">
          <details><summary>{copy.home_37}</summary><p>{copy.home_38}</p></details>
          <details><summary>{copy.home_39}</summary><p>{copy.home_40}</p></details>
          <details><summary>{copy.home_41}</summary><p>{copy.home_42}</p></details>
        </div>
      </section>

      <section id="contacto" className="vt-contact vt-anchor" aria-labelledby="contacto-title">
        <div className="vt-contact__copy"><h2 id="contacto-title">{copy.home_43}</h2>{' '}<p>{copy.home_44}</p></div>
        <div className="vt-contact__form" data-pagosya-contact data-track="contact" />
      </section>
    </main>
  </Shell>;
}
