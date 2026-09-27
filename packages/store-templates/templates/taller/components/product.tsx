import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ta-pdp">
        <KitSlot kind="product" name="breadcrumb" className="ta-pdp__crumbs" />
        <div className="ta-pdp__grid">
          <KitSlot kind="product" name="gallery" className="ta-pdp__gallery" />
          <div className="ta-pdp__info">
            <KitSlot kind="product" name="category" className="ta-pdp__cat" />
            <KitSlot kind="product" name="title" className="ta-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="ta-pdp__price" />
            <KitSlot kind="product" name="description" className="ta-pdp__desc" />
            <KitSlot kind="product" name="buy" className="ta-pdp__buy" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ta-page" data-pagosya-product-page />
  </Shell>;
}
