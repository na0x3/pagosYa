import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="bo-pdp">
        <div className="bo-pdp__grid">
          <KitSlot kind="product" name="gallery" className="bo-pdp__gallery" />
          <div className="bo-pdp__info">
            <KitSlot kind="product" name="category" className="bo-pdp__cat" />
            <KitSlot kind="product" name="title" className="bo-pdp__title" />
            <KitSlot kind="product" name="rating" className="bo-pdp__rating" />
            <KitSlot kind="product" name="pricing" className="bo-pdp__price" />
            <KitSlot kind="product" name="buy" className="bo-pdp__buy" />
            <KitSlot kind="product" name="description" className="bo-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="bo-pdp__highlights" />
            <KitSlot kind="product" name="info" className="bo-pdp__more" />
            <KitSlot kind="product" name="delivery" className="bo-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="bundles" className="bo-pdp__band" />
        <KitSlot kind="product" name="related" className="bo-pdp__band" />
        <KitSlot kind="product" name="reviews" className="bo-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="bo-page" data-pagosya-product-page />
  </Shell>;
}
