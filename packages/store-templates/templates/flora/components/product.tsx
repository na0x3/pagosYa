import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="fl-pdp">
        <KitSlot kind="product" name="breadcrumb" className="fl-pdp__crumbs" />
        <div className="fl-pdp__grid">
          <KitSlot kind="product" name="gallery" className="fl-pdp__gallery" />
          <div className="fl-pdp__info">
            <KitSlot kind="product" name="category" className="fl-kicker" />
            <KitSlot kind="product" name="title" className="fl-pdp__title" />
            <KitSlot kind="product" name="pricing" className="fl-pdp__price" />
            <KitSlot kind="product" name="description" className="fl-pdp__desc" />
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
    <main id="contenido" className="fl-page" data-pagosya-product-page />
  </Shell>;
}
