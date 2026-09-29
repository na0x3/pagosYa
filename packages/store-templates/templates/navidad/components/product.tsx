import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="na-pdp">
        <div className="na-pdp__grid">
          <div className="na-pdp__stage">
            <KitSlot kind="product" name="gallery" className="na-pdp__gallery" />
          </div>
          <div className="na-pdp__info">
            <KitSlot kind="product" name="category" className="na-pdp__cat" />
            <KitSlot kind="product" name="title" className="na-pdp__title" />
            <KitSlot kind="product" name="pricing" className="na-pdp__price" />
            <KitSlot kind="product" name="buy" className="na-pdp__buy" />
            <KitSlot kind="product" name="description" className="na-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="na-pdp__highlights" />
            <details className="na-pdp__toggle" open>
              <summary>Medidas, material y cuidado</summary>
              <KitSlot kind="product" name="info" className="na-pdp__more" />
            </details>
            <details className="na-pdp__toggle">
              <summary>Envíos</summary>
              <p>Enviamos en 2 a 5 días hábiles, con empaque que protege los adornos.</p>
              <KitSlot kind="product" name="delivery" className="na-pdp__delivery" />
            </details>
          </div>
        </div>
        <KitSlot kind="product" name="related" className="na-pdp__band" />
        <KitSlot kind="product" name="reviews" className="na-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="na-page" data-pagosya-product-page />
  </Shell>;
}
