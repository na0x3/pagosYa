import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="pa-pdp">
        <div className="pa-pdp__grid">
          <KitSlot kind="product" name="gallery" className="pa-pdp__gallery" />
          <div className="pa-pdp__info">
            <KitSlot kind="product" name="breadcrumb" className="pa-pdp__crumbs" />
            <KitSlot kind="product" name="title" className="pa-pdp__title" />
            <KitSlot kind="product" name="pricing" className="pa-pdp__price" />
            <KitSlot kind="product" name="description" className="pa-pdp__desc" />
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
    <main id="contenido" className="pa-page" data-pagosya-product-page />
  </Shell>;
}
