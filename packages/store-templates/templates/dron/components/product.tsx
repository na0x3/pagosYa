import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="dr-pdp">
        <div className="dr-pdp__grid">
          <div className="dr-pdp__stage">
            <KitSlot kind="product" name="gallery" className="dr-pdp__gallery" />
          </div>
          <div className="dr-pdp__info">
            <KitSlot kind="product" name="category" className="dr-pdp__cat" />
            <KitSlot kind="product" name="title" className="dr-pdp__title" />
            <KitSlot kind="product" name="pricing" className="dr-pdp__price" />
            <KitSlot kind="product" name="buy" className="dr-pdp__buy" />
            <KitSlot kind="product" name="description" className="dr-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="dr-pdp__highlights" />
            <KitSlot kind="product" name="info" className="dr-pdp__specs" />
            <details className="dr-pdp__toggle">
              <summary>Garantía y envíos</summary>
              <p>Garantía de 12 meses y cambios en 7 días. Envío al día siguiente en las ciudades principales.</p>
              <KitSlot kind="product" name="delivery" className="dr-pdp__delivery" />
            </details>
          </div>
        </div>
        <KitSlot kind="product" name="related" className="dr-pdp__band" />
        <KitSlot kind="product" name="reviews" className="dr-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="dr-page" data-pagosya-product-page />
  </Shell>;
}
