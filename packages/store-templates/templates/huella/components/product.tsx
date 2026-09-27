import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="hl-pdp">
        <KitSlot kind="product" name="breadcrumb" className="hl-pdp__crumbs" />
        <div className="hl-pdp__grid">
          <KitSlot kind="product" name="gallery" className="hl-pdp__gallery" />
          <div className="hl-pdp__info">
            <KitSlot kind="product" name="title" className="hl-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="hl-pdp__price" />
            <KitSlot kind="product" name="description" className="hl-pdp__desc" />
            <KitSlot kind="product" name="buy" />
            <KitSlot kind="product" name="highlights" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="hl-page" data-pagosya-product-page />
  </Shell>;
}
