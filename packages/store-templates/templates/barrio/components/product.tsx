import { copy } from './store-data';
import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ba-pdp">
        <div className="ba-pdp__grid">
          <KitSlot kind="product" name="gallery" className="ba-pdp__gallery" />
          <div className="ba-pdp__info">
            <KitSlot kind="product" name="category" className="ba-pdp__cat" />
            <KitSlot kind="product" name="title" className="ba-pdp__title" />
            <KitSlot kind="product" name="pricing" className="ba-pdp__price" />
            <KitSlot kind="product" name="buy" className="ba-pdp__buy" />
            <KitSlot kind="product" name="description" className="ba-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="ba-pdp__highlights" />
            <details className="ba-pdp__toggle">
              <summary>{copy.product_1}</summary>
              <KitSlot kind="product" name="info" className="ba-pdp__more" />
            </details>
            <details className="ba-pdp__toggle">
              <summary>{copy.product_2}</summary>
              <p>{copy.product_3}</p>
              <KitSlot kind="product" name="delivery" className="ba-pdp__delivery" />
            </details>
          </div>
        </div>
        <KitSlot kind="product" name="related" className="ba-pdp__band" />
        <KitSlot kind="product" name="reviews" className="ba-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ba-page" data-pagosya-product-page />
  </Shell>;
}
