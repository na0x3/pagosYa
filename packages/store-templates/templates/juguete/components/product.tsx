import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ju-pdp">
        <KitSlot kind="product" name="breadcrumb" className="ju-pdp__crumbs" />
        <div className="ju-pdp__grid">
          <KitSlot kind="product" name="gallery" className="ju-pdp__gallery" />
          <div className="ju-pdp__info">
            <KitSlot kind="product" name="title" className="ju-pdp__title" />
            <KitSlot kind="product" name="pricing" className="ju-pdp__price" />
            <KitSlot kind="product" name="description" className="ju-pdp__desc" />
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
    <main id="contenido" className="ju-page" data-pagosya-product-page />
  </Shell>;
}
