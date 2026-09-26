import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="pg-pdp">
        <KitSlot kind="product" name="breadcrumb" className="pg-pdp__crumbs" />
        <div className="pg-pdp__grid">
          <KitSlot kind="product" name="gallery" className="pg-pdp__gallery" />
          <div className="pg-pdp__info">
            <KitSlot kind="product" name="category" className="pg-kicker" />
            <KitSlot kind="product" name="title" className="pg-pdp__title" />
            <KitSlot kind="product" name="description" className="pg-pdp__desc" />
            <KitSlot kind="product" name="pricing" className="pg-pdp__price" />
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
    <main id="contenido" className="pg-page" data-pagosya-product-page />
  </Shell>;
}
