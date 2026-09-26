import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="cr-pdp">
        <KitSlot kind="product" name="breadcrumb" className="cr-pdp__crumbs" />
        <div className="cr-pdp__grid">
          <KitSlot kind="product" name="gallery" className="cr-pdp__gallery" />
          <div className="cr-pdp__info">
            <KitSlot kind="product" name="title" className="cr-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="cr-pdp__price" />
            <KitSlot kind="product" name="description" className="cr-pdp__desc" />
            <KitSlot kind="product" name="highlights" />
            <KitSlot kind="product" name="buy" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="cr-page" data-pagosya-product-page />
  </Shell>;
}
