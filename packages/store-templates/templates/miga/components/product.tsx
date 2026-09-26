import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="mi-pdp">
        <KitSlot kind="product" name="breadcrumb" className="mi-pdp__crumbs" />
        <div className="mi-pdp__grid">
          <KitSlot kind="product" name="gallery" className="mi-pdp__gallery" />
          <div className="mi-pdp__info">
            <KitSlot kind="product" name="title" className="mi-pdp__title" />
            <KitSlot kind="product" name="pricing" className="mi-pdp__price" />
            <KitSlot kind="product" name="description" className="mi-pdp__desc" />
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
    <main id="contenido" className="mi-page" data-pagosya-product-page />
  </Shell>;
}
