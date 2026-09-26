import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="pa2-pdp">
        <KitSlot kind="product" name="breadcrumb" className="pa2-pdp__crumbs" />
        <div className="pa2-pdp__grid">
          <KitSlot kind="product" name="gallery" className="pa2-pdp__gallery" />
          <div className="pa2-pdp__info">
            <KitSlot kind="product" name="category" className="pa2-pdp__cat" />
            <KitSlot kind="product" name="title" className="pa2-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="pa2-pdp__price" />
            <KitSlot kind="product" name="description" className="pa2-pdp__desc" />
            <KitSlot kind="product" name="buy" className="pa2-pdp__buy" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="pa2-page" data-pagosya-product-page />
  </Shell>;
}
