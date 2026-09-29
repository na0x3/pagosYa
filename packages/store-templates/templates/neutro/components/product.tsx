import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ne-pdp">
        <div className="ne-pdp__grid">
          <div className="ne-pdp__stage">
            <KitSlot kind="product" name="gallery" className="ne-pdp__gallery" />
          </div>
          <div className="ne-pdp__info">
            <KitSlot kind="product" name="category" className="ne-pdp__cat" />
            <KitSlot kind="product" name="title" className="ne-pdp__title" />
            <KitSlot kind="product" name="pricing" className="ne-pdp__price" />
            <KitSlot kind="product" name="buy" className="ne-pdp__buy" />
            <KitSlot kind="product" name="description" className="ne-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="ne-pdp__highlights" />
            <KitSlot kind="product" name="info" className="ne-pdp__more" />
            <KitSlot kind="product" name="delivery" className="ne-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" className="ne-pdp__band" />
        <KitSlot kind="product" name="reviews" className="ne-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ne-page" data-pagosya-product-page />
  </Shell>;
}
