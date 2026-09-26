import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ve-pdp">
        <KitSlot kind="product" name="breadcrumb" className="ve-pdp__crumbs" />
        <div className="ve-pdp__grid">
          <KitSlot kind="product" name="gallery" className="ve-pdp__gallery" />
          <div className="ve-pdp__info">
            <KitSlot kind="product" name="category" className="ve-kicker" />
            <KitSlot kind="product" name="title" className="ve-pdp__title" />
            <KitSlot kind="product" name="pricing" className="ve-pdp__price" />
            <KitSlot kind="product" name="description" className="ve-pdp__desc" />
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
    <main id="contenido" className="ve-page" data-pagosya-product-page />
  </Shell>;
}
