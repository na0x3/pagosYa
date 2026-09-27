import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ri-pdp">
        <KitSlot kind="product" name="breadcrumb" className="ri-pdp__crumbs" />
        <div className="ri-pdp__grid">
          <KitSlot kind="product" name="gallery" className="ri-pdp__gallery" />
          <div className="ri-pdp__info">
            <KitSlot kind="product" name="title" className="ri-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="ri-pdp__price" />
            <KitSlot kind="product" name="buy" />
            <KitSlot kind="product" name="description" className="ri-pdp__desc" />
            <KitSlot kind="product" name="highlights" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ri-page" data-pagosya-product-page />
  </Shell>;
}
