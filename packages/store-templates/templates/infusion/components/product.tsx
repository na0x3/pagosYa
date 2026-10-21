import { copy } from './store-data';
import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="in-pdp">
        <div className="in-pdp__grid">
          <div className="in-pdp__stage">
            <KitSlot kind="product" name="gallery" className="in-pdp__gallery" />
          </div>
          <div className="in-pdp__info">
            <KitSlot kind="product" name="category" className="in-pdp__cat" />
            <KitSlot kind="product" name="title" className="in-pdp__title" />
            <KitSlot kind="product" name="description" className="in-pdp__desc" />
            <KitSlot kind="product" name="pricing" className="in-pdp__price" />
            <KitSlot kind="product" name="buy" className="in-pdp__buy" />
            <KitSlot kind="product" name="highlights" className="in-pdp__highlights" />
            <details className="in-pdp__toggle" open>
              <summary>{copy.product_1}</summary>
              <KitSlot kind="product" name="info" className="in-pdp__more" />
            </details>
            <details className="in-pdp__toggle">
              <summary>{copy.product_2}</summary>
              <p>{copy.product_3}</p>
              <KitSlot kind="product" name="delivery" className="in-pdp__delivery" />
            </details>
          </div>
        </div>
        <KitSlot kind="product" name="related" className="in-pdp__band" />
        <KitSlot kind="product" name="reviews" className="in-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="in-page" data-pagosya-product-page />
  </Shell>;
}
