import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="tz-pdp">
        <KitSlot kind="product" name="breadcrumb" className="tz-pdp__crumbs" />
        <div className="tz-pdp__grid">
          <KitSlot kind="product" name="gallery" className="tz-pdp__gallery" />
          <div className="tz-pdp__info">
            <KitSlot kind="product" name="category" className="tz-pdp__cat" />
            <KitSlot kind="product" name="title" className="tz-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="tz-pdp__price" />
            <KitSlot kind="product" name="description" className="tz-pdp__desc" />
            <KitSlot kind="product" name="buy" className="tz-pdp__buy" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="tz-page" data-pagosya-product-page />
  </Shell>;
}
