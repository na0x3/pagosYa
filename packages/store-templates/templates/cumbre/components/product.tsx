import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="cu-pdp">
        <KitSlot kind="product" name="breadcrumb" className="cu-pdp__crumbs" />
        <div className="cu-pdp__grid">
          <KitSlot kind="product" name="gallery" className="cu-pdp__gallery" />
          <div className="cu-pdp__info">
            <KitSlot kind="product" name="title" className="cu-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="cu-pdp__price" />
            <KitSlot kind="product" name="buy" />
            <KitSlot kind="product" name="description" className="cu-pdp__desc" />
            <KitSlot kind="product" name="highlights" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="cu-page" data-pagosya-product-page />
  </Shell>;
}
