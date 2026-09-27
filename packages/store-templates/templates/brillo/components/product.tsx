import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="br-pdp">
        <KitSlot kind="product" name="breadcrumb" className="br-pdp__crumbs" />
        <div className="br-pdp__grid">
          <KitSlot kind="product" name="gallery" className="br-pdp__gallery" />
          <div className="br-pdp__info">
            <KitSlot kind="product" name="category" className="br-kicker" />
            <KitSlot kind="product" name="title" className="br-pdp__title" />
            <KitSlot kind="product" name="pricing" className="br-pdp__price" />
            <KitSlot kind="product" name="description" className="br-pdp__desc" />
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
    <main id="contenido" className="br-page" data-pagosya-product-page />
  </Shell>;
}
