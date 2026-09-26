import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="hu-pdp">
        <KitSlot kind="product" name="breadcrumb" className="hu-pdp__crumbs" />
        <div className="hu-pdp__grid">
          <KitSlot kind="product" name="gallery" className="hu-pdp__gallery" />
          <div className="hu-pdp__info">
            <KitSlot kind="product" name="category" className="hu-tag" />
            <KitSlot kind="product" name="title" className="hu-pdp__title" />
            <KitSlot kind="product" name="pricing" className="hu-pdp__price" />
            <KitSlot kind="product" name="description" className="hu-pdp__desc" />
            <KitSlot kind="product" name="buy" />
            <KitSlot kind="product" name="highlights" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
            <KitSlot kind="product" name="rating" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="hu-page" data-pagosya-product-page />
  </Shell>;
}
