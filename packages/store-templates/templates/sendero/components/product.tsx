import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="se-pdp">
        <div className="se-pdp__grid">
          <KitSlot kind="product" name="gallery" className="se-pdp__gallery" />
          <div className="se-pdp__info">
            <KitSlot kind="product" name="category" className="se-pdp__cat" />
            <KitSlot kind="product" name="title" className="se-pdp__title" />
            <KitSlot kind="product" name="pricing" className="se-pdp__price" />
            <KitSlot kind="product" name="buy" className="se-pdp__buy" />
            <KitSlot kind="product" name="description" className="se-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="se-pdp__highlights" />
            <KitSlot kind="product" name="info" className="se-pdp__more" />
            <KitSlot kind="product" name="delivery" className="se-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" className="se-pdp__band" />
        <KitSlot kind="product" name="reviews" className="se-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="se-page" data-pagosya-product-page />
  </Shell>;
}
