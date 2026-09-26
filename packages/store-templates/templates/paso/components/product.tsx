import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ps-pdp">
        <KitSlot kind="product" name="breadcrumb" className="ps-pdp__crumbs" />
        <div className="ps-pdp__grid">
          <KitSlot kind="product" name="gallery" className="ps-pdp__gallery" />
          <div className="ps-pdp__info">
            <KitSlot kind="product" name="category" className="ps-pdp__cat" />
            <KitSlot kind="product" name="title" className="ps-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="ps-pdp__price" />
            <KitSlot kind="product" name="description" className="ps-pdp__desc" />
            <KitSlot kind="product" name="buy" className="ps-pdp__buy" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ps-page" data-pagosya-product-page />
  </Shell>;
}
