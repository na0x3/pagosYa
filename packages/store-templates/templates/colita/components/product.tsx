import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="co-pdp">
        <KitSlot kind="product" name="breadcrumb" className="co-pdp__crumbs" />
        <div className="co-pdp__grid">
          <div className="co-pdp__frame">
            <KitSlot kind="product" name="gallery" className="co-pdp__gallery" />
          </div>
          <div className="co-pdp__info">
            <KitSlot kind="product" name="category" className="co-pdp__cat" />
            <KitSlot kind="product" name="title" className="co-pdp__title" />
            <KitSlot kind="product" name="rating" className="co-pdp__rating" />
            <KitSlot kind="product" name="pricing" className="co-pdp__price" />
            <KitSlot kind="product" name="buy" className="co-pdp__buy" />
            <div className="co-pdp__for">
              <p className="co-pdp__for-label">Para:</p>
              <KitSlot kind="product" name="highlights" className="co-pdp__chips" />
            </div>
            <KitSlot kind="product" name="description" className="co-pdp__desc" />
            <div className="co-pdp__feeding">
              <p className="co-pdp__feeding-title">Guía de alimentación</p>
              <KitSlot kind="product" name="info" className="co-pdp__table" />
            </div>
            <KitSlot kind="product" name="delivery" className="co-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="bundles" className="co-pdp__band" />
        <KitSlot kind="product" name="related" className="co-pdp__band" />
        <KitSlot kind="product" name="reviews" className="co-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="co-page" data-pagosya-product-page />
  </Shell>;
}
