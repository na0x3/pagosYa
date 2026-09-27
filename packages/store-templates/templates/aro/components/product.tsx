import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ar-pdp">
        <KitSlot kind="product" name="breadcrumb" className="ar-pdp__crumbs" />
        <div className="ar-pdp__grid">
          <KitSlot kind="product" name="gallery" className="ar-pdp__gallery" />
          <div className="ar-pdp__info">
            <KitSlot kind="product" name="category" className="ar-pdp__cat" />
            <KitSlot kind="product" name="title" className="ar-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="ar-pdp__price" />
            <KitSlot kind="product" name="description" className="ar-pdp__desc" />
            <KitSlot kind="product" name="buy" className="ar-pdp__buy" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ar-page" data-pagosya-product-page />
  </Shell>;
}
