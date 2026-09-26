import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="en-pdp">
        <KitSlot kind="product" name="breadcrumb" className="en-pdp__crumbs" />
        <div className="en-pdp__grid">
          <KitSlot kind="product" name="gallery" className="en-pdp__gallery" />
          <div className="en-pdp__info">
            <KitSlot kind="product" name="category" className="en-pdp__cat" />
            <KitSlot kind="product" name="title" className="en-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="en-pdp__price" />
            <KitSlot kind="product" name="description" className="en-pdp__desc" />
            <KitSlot kind="product" name="buy" className="en-pdp__buy" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="en-page" data-pagosya-product-page />
  </Shell>;
}
