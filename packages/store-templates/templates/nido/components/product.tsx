import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ni-pdp">
        <KitSlot kind="product" name="breadcrumb" className="ni-pdp__crumbs" />
        <div className="ni-pdp__grid">
          <KitSlot kind="product" name="gallery" className="ni-pdp__gallery" />
          <div className="ni-pdp__info">
            <KitSlot kind="product" name="title" className="ni-pdp__title" />
            <KitSlot kind="product" name="pricing" className="ni-pdp__price" />
            <KitSlot kind="product" name="description" className="ni-pdp__desc" />
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
    <main id="contenido" className="ni-page" data-pagosya-product-page />
  </Shell>;
}
