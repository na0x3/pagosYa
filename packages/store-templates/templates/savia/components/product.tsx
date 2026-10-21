import { copy } from './store-data';
import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="sv-pdp">
        <div className="sv-pdp__grid">
          <KitSlot kind="product" name="gallery" className="sv-pdp__gallery" />
          <div className="sv-pdp__info">
            <KitSlot kind="product" name="category" className="sv-pdp__cat" />
            <KitSlot kind="product" name="title" className="sv-pdp__title" />
            <ul className="sv-pdp__chips">
              <li>{copy.product_1}</li>
              <li>{copy.product_2}</li>
              <li>{copy.product_3}</li>
            </ul>
            <KitSlot kind="product" name="pricing" className="sv-pdp__price" />
            <KitSlot kind="product" name="buy" className="sv-pdp__buy" />
            <KitSlot kind="product" name="description" className="sv-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="sv-pdp__highlights" />
            <details className="sv-pdp__toggle" open>
              <summary>{copy.product_4}</summary>
              <KitSlot kind="product" name="info" className="sv-pdp__more" />
            </details>
            <details className="sv-pdp__toggle">
              <summary>{copy.product_5}</summary>
              <KitSlot kind="product" name="delivery" className="sv-pdp__delivery" />
            </details>
          </div>
        </div>
        <KitSlot kind="product" name="related" className="sv-pdp__band" />
        <KitSlot kind="product" name="reviews" className="sv-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="sv-page" data-pagosya-product-page />
  </Shell>;
}
