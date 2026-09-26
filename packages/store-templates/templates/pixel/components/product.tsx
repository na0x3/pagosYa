import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="px-pdp">
        <KitSlot kind="product" name="breadcrumb" className="px-pdp__crumbs" />
        <div className="px-pdp__grid">
          <KitSlot kind="product" name="gallery" className="px-pdp__gallery" />
          <div className="px-pdp__info">
            <KitSlot kind="product" name="category" className="px-pill" />
            <KitSlot kind="product" name="title" className="px-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="px-pdp__price" />
            <KitSlot kind="product" name="buy" />
            <KitSlot kind="product" name="description" className="px-pdp__desc" />
            <KitSlot kind="product" name="highlights" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="px-page" data-pagosya-product-page />
  </Shell>;
}
