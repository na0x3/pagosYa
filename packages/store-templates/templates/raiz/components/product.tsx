import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ra-pdp">
        <KitSlot kind="product" name="breadcrumb" className="ra-pdp__crumbs" />
        <div className="ra-pdp__grid">
          <KitSlot kind="product" name="gallery" className="ra-pdp__gallery" />
          <div className="ra-pdp__info">
            <KitSlot kind="product" name="category" className="ra-pdp__cat" />
            <KitSlot kind="product" name="title" className="ra-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="ra-pdp__price" />
            <KitSlot kind="product" name="description" className="ra-pdp__desc" />
            <KitSlot kind="product" name="buy" className="ra-pdp__buy" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ra-page" data-pagosya-product-page />
  </Shell>;
}
