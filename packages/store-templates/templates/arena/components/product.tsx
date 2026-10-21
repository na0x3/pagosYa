import { copy } from './store-data';
import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ar-pdp">
        <div className="ar-pdp__grid">
          <div className="ar-pdp__stage">
            <KitSlot kind="product" name="gallery" className="ar-pdp__gallery" />
          </div>
          <div className="ar-pdp__info">
            <KitSlot kind="product" name="category" className="ar-pdp__cat" />
            <KitSlot kind="product" name="title" className="ar-pdp__title" />
            <KitSlot kind="product" name="pricing" className="ar-pdp__price" />
            <KitSlot kind="product" name="buy" className="ar-pdp__buy" />
            <KitSlot kind="product" name="description" className="ar-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="ar-pdp__highlights" />
            <details className="ar-pdp__toggle" open>
              <summary>{copy.product_1}</summary>
              <KitSlot kind="product" name="info" className="ar-pdp__more" />
            </details>
            <details className="ar-pdp__toggle">
              <summary>{copy.product_2}</summary>
              <p>{copy.product_3}</p>
              <KitSlot kind="product" name="delivery" className="ar-pdp__delivery" />
            </details>
          </div>
        </div>
        <KitSlot kind="product" name="related" className="ar-pdp__band" />
        <KitSlot kind="product" name="reviews" className="ar-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ar-page" data-pagosya-product-page />
  </Shell>;
}
