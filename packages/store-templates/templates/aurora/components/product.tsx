import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="au-pdp">
        <KitSlot kind="product" name="breadcrumb" className="au-pdp__crumbs" />
        <div className="au-pdp__grid">
          <KitSlot kind="product" name="gallery" className="au-pdp__gallery" />
          <div className="au-pdp__info">
            <KitSlot kind="product" name="category" className="au-eyebrow" />
            <KitSlot kind="product" name="title" className="au-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="au-pdp__price" />
            <KitSlot kind="product" name="description" className="au-pdp__desc" />
            <KitSlot kind="product" name="buy" className="au-pdp__buy" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="au-pdp-page" data-pagosya-product-page />
  </Shell>;
}
