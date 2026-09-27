import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="li-pdp">
        <div className="li-pdp__grid">
          <KitSlot kind="product" name="gallery" className="li-pdp__gallery" />
          <div className="li-pdp__info">
            <KitSlot kind="product" name="breadcrumb" className="li-mono" />
            <KitSlot kind="product" name="title" className="li-pdp__title" />
            <KitSlot kind="product" name="description" className="li-pdp__desc" />
            <KitSlot kind="product" name="pricing" className="li-pdp__price" />
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
    <main id="contenido" className="li-page" data-pagosya-product-page />
  </Shell>;
}
