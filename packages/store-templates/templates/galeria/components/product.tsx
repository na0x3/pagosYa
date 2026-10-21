import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';
import { photos, copy } from './store-data';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ga-pdp">
        <div className="ga-pdp__grid">
          <div className="ga-pdp__left">
            <KitSlot kind="product" name="gallery" className="ga-pdp__gallery" />
            <figure className="ga-pdp__wall">
              <img src={photos.pared} alt={copy.product_1} />
              <figcaption>{copy.product_2}</figcaption>
            </figure>
          </div>
          <div className="ga-pdp__info">
            <KitSlot kind="product" name="category" className="ga-pdp__cat" />
            <KitSlot kind="product" name="title" className="ga-pdp__title" />
            <KitSlot kind="product" name="pricing" className="ga-pdp__price" />
            <KitSlot kind="product" name="buy" className="ga-pdp__buy" />
            <KitSlot kind="product" name="description" className="ga-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="ga-pdp__highlights" />
            <ul className="ga-pdp__notes">
              <li><b>{copy.product_3}</b><span>{copy.product_4}</span></li>
              <li><b>{copy.product_5}</b><span>{copy.product_6}</span></li>
            </ul>
            <KitSlot kind="product" name="info" className="ga-pdp__more" />
            <KitSlot kind="product" name="delivery" className="ga-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" className="ga-pdp__band" />
        <KitSlot kind="product" name="reviews" className="ga-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ga-page" data-pagosya-product-page />
  </Shell>;
}
