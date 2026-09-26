import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ch-pdp">
        <KitSlot kind="product" name="breadcrumb" className="ch-pdp__crumbs" />
        <div className="ch-pdp__grid">
          <KitSlot kind="product" name="gallery" className="ch-pdp__gallery" />
          <div className="ch-pdp__info">
            <KitSlot kind="product" name="category" className="ch-eyebrow" />
            <KitSlot kind="product" name="title" className="ch-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="ch-pdp__price" />
            <KitSlot kind="product" name="description" className="ch-pdp__desc" />
            <KitSlot kind="product" name="highlights" />
            <KitSlot kind="product" name="buy" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ch-page" data-pagosya-product-page />
  </Shell>;
}
