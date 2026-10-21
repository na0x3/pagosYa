import { copy } from './store-data';
import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="au-pdp">
        <div className="au-pdp__grid">
          <div className="au-pdp__stage">
            <KitSlot kind="product" name="gallery" className="au-pdp__gallery" />
          </div>
          <div className="au-pdp__info">
            <KitSlot kind="product" name="category" className="au-pdp__cat" />
            <KitSlot kind="product" name="title" className="au-pdp__title" />
            <KitSlot kind="product" name="pricing" className="au-pdp__price" />
            <KitSlot kind="product" name="buy" className="au-pdp__buy" />
            <p className="au-pdp__gift">{copy.product_1}</p>
            <KitSlot kind="product" name="description" className="au-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="au-pdp__highlights" />
            <details className="au-pdp__toggle" open>
              <summary>{copy.product_2}</summary>
              <KitSlot kind="product" name="info" className="au-pdp__more" />
            </details>
            <details className="au-pdp__toggle">
              <summary>{copy.product_3}</summary>
              <p>{copy.product_4}</p>
              <KitSlot kind="product" name="delivery" className="au-pdp__delivery" />
            </details>
          </div>
        </div>
        <KitSlot kind="product" name="related" className="au-pdp__band" />
        <KitSlot kind="product" name="reviews" className="au-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="au-page" data-pagosya-product-page />
  </Shell>;
}
