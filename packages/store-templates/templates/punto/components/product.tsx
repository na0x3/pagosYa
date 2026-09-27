import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="pt-pdp">
        <KitSlot kind="product" name="breadcrumb" className="pt-pdp__crumbs" />
        <div className="pt-pdp__grid">
          <KitSlot kind="product" name="gallery" className="pt-pdp__gallery" />
          <div className="pt-pdp__info">
            <KitSlot kind="product" name="category" className="pt-pdp__cat" />
            <KitSlot kind="product" name="title" className="pt-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="pt-pdp__price" />
            <KitSlot kind="product" name="description" className="pt-pdp__desc" />
            <KitSlot kind="product" name="buy" className="pt-pdp__buy" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="pt-page" data-pagosya-product-page />
  </Shell>;
}
