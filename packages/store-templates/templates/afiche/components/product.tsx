import { copy } from './store-data';
import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="af-pdp">
        <div className="af-pdp__grid">
          <div className="af-pdp__frame">
            <KitSlot kind="product" name="gallery" className="af-pdp__gallery" />
          </div>
          <div className="af-pdp__info">
            <KitSlot kind="product" name="category" className="af-pdp__cat" />
            <KitSlot kind="product" name="title" className="af-pdp__title" />
            <KitSlot kind="product" name="pricing" className="af-pdp__price" />
            <KitSlot kind="product" name="buy" className="af-pdp__buy" />
            <KitSlot kind="product" name="description" className="af-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="af-pdp__highlights" />
            <ul className="af-pdp__specs">
              <li><span>{copy.product_1}</span><b>{copy.product_2}</b></li>
              <li><span>{copy.product_3}</span><b>{copy.product_4}</b></li>
              <li><span>{copy.product_5}</span><b>{copy.product_6}</b></li>
            </ul>
            <KitSlot kind="product" name="info" className="af-pdp__more" />
            <KitSlot kind="product" name="delivery" className="af-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" className="af-pdp__band" />
        <KitSlot kind="product" name="reviews" className="af-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="af-page" data-pagosya-product-page />
  </Shell>;
}
