import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const info = [
  { title: 'Impresión', body: 'Papel de algodón de archivo y tintas pigmentadas que no se decoloran.' },
  { title: 'Marco', body: 'Puedes pedir la obra con marco de madera o solo la impresión.' },
  { title: 'Envío', body: 'Viaja en tubo o en caja rígida, protegida en cada esquina.' },
];
const faqs = [
  { q: '¿Son ediciones limitadas?', a: 'Cada obra indica en su ficha si es una edición numerada y cuántas copias existen.' },
  { q: '¿Qué tamaños hay?', a: 'Los tamaños disponibles aparecen al elegir la obra.' },
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco o con tarjeta.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section className="li-hero">
        <div className="li-hero__copy">
          <p className="li-mono">Colección actual</p>
          <h1 className="li-display">Obras para vivir con ellas</h1>
          <a className="li-link" href="#obras">Ver todas las obras →</a>
        </div>
        <figure className="li-hang">
          <div className="li-mat"><div className="li-mat__window"><Parallax strength={60} mobileStrength={30} className="li-drift"><img src={photos.obra} alt={`Obra destacada de ${store.name}`} /></Parallax></div></div>
          <figcaption className="li-placard"><strong>Obra destacada</strong><span>Impresión de archivo</span><span>{store.name}</span></figcaption>
        </figure>
      </section>

      <section id="obras" className="li-shop" aria-labelledby="li-shop-title">
        <Reveal><header className="li-shop__head"><h2 id="li-shop-title" className="li-title">Obras</h2><p className="li-mono">Todas disponibles</p></header></Reveal>
        <template data-pagosya-product-template>
          <article className="li-card">
            <a className="li-card__mat" data-product-link href="product.html"><img data-product-field="image" alt="Foto de la obra" /></a>
            <div className="li-card__placard">
              <h3 className="li-card__name" data-product-field="name">Obra</h3>
              <p className="li-card__desc" data-product-field="description" />
              <p className="li-card__price" data-product-field="price" />
              <button type="button" className="li-card__add" data-product-add>Agregar al carrito</button>
            </div>
          </article>
        </template>
        <div className="li-grid" data-pagosya-catalog />
      </section>

      <section id="artista" className="li-artist" aria-labelledby="li-artist-title">
        <Reveal><img src={photos.estudio} alt="El estudio" /></Reveal>
        <Reveal delay={120}>
          <p className="li-mono">Sobre la obra</p>
          <h2 id="li-artist-title" className="li-title">Hecho despacio, para mirar despacio</h2>
          <p>Cada obra nace en el estudio y se imprime solo cuando alguien la elige. Así ninguna copia se desperdicia.</p>
        </Reveal>
      </section>

      <section id="envio" className="li-info" aria-labelledby="li-info-title">
        <Reveal><h2 id="li-info-title" className="li-title">Impresión y envío</h2></Reveal>
        <Reveal delay={100}><dl>{info.map(item => <div key={item.title}><dt className="li-mono">{item.title}</dt><dd>{item.body}</dd></div>)}</dl></Reveal>
      </section>

      <section id="preguntas" className="li-faq" aria-labelledby="li-faq-title">
        <Reveal><h2 id="li-faq-title" className="li-title">Preguntas</h2></Reveal>
        {faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>
    </main>
  </Shell>;
}
