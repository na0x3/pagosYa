import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="rt-pdp">
        <div className="rt-pdp__grid">
          <div className="rt-pdp__stage">
            <KitSlot kind="product" name="gallery" className="rt-pdp__gallery" />
          </div>
          <div className="rt-pdp__info">
            <KitSlot kind="product" name="category" className="rt-pdp__cat" />
            <KitSlot kind="product" name="title" className="rt-pdp__title" />
            <KitSlot kind="product" name="pricing" className="rt-pdp__price" />
            <KitSlot kind="product" name="buy" className="rt-pdp__buy" />
            <KitSlot kind="product" name="description" className="rt-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="rt-pdp__highlights" />
            <details className="rt-pdp__toggle" open>
              <summary>Tela, tallas y cuidado</summary>
              <KitSlot kind="product" name="info" className="rt-pdp__more" />
            </details>
            <details className="rt-pdp__toggle">
              <summary>Envíos</summary>
              <p>Enviamos en 2 a 5 días hábiles. Cambios de talla en 7 días.</p>
              <KitSlot kind="product" name="delivery" className="rt-pdp__delivery" />
            </details>
          </div>
        </div>
        <KitSlot kind="product" name="related" className="rt-pdp__band" />
        <KitSlot kind="product" name="reviews" className="rt-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="rt-page" data-pagosya-product-page />
  </Shell>;
}
