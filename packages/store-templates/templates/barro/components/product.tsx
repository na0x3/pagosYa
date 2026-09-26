import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ba-pdp">
        <KitSlot kind="product" name="breadcrumb" className="ba-pdp__crumbs" />
        <div className="ba-pdp__grid">
          <KitSlot kind="product" name="gallery" className="ba-pdp__gallery" />
          <div className="ba-pdp__info">
            <KitSlot kind="product" name="category" className="ba-kicker" />
            <KitSlot kind="product" name="title" className="ba-pdp__title" />
            <KitSlot kind="product" name="pricing" className="ba-pdp__price" />
            <KitSlot kind="product" name="description" className="ba-pdp__desc" />
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
    <main id="contenido" className="ba-page" data-pagosya-product-page />
  </Shell>;
}
