import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="tv-pdp">
        <KitSlot kind="product" name="breadcrumb" className="tv-pdp__crumbs" />
        <div className="tv-pdp__grid">
          <KitSlot kind="product" name="gallery" className="tv-pdp__gallery" />
          <div className="tv-pdp__info">
            <KitSlot kind="product" name="category" className="tv-kicker" />
            <KitSlot kind="product" name="title" className="tv-pdp__title" />
            <KitSlot kind="product" name="pricing" className="tv-pdp__price" />
            <KitSlot kind="product" name="description" className="tv-pdp__desc" />
            <KitSlot kind="product" name="highlights" />
            <KitSlot kind="product" name="buy" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="rating" />
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="tv-page" data-pagosya-product-page />
  </Shell>;
}
