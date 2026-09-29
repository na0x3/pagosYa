import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="gr-pdp">
        <KitSlot kind="product" name="breadcrumb" className="gr-pdp__crumbs" />
        <div className="gr-pdp__grid">
          <KitSlot kind="product" name="gallery" className="gr-pdp__gallery" />
          <div className="gr-pdp__info">
            <KitSlot kind="product" name="category" className="gr-pdp__cat" />
            <KitSlot kind="product" name="title" className="gr-pdp__title" />
            <KitSlot kind="product" name="rating" className="gr-pdp__rating" />
            <KitSlot kind="product" name="pricing" className="gr-pdp__price" />
            <KitSlot kind="product" name="buy" className="gr-pdp__buy" />
            <div className="gr-pdp__delivery">
              <p className="gr-pdp__delivery-title">Entrega y pago</p>
              <KitSlot kind="product" name="delivery" className="gr-pdp__delivery-slot" />
            </div>
            <KitSlot kind="product" name="highlights" className="gr-pdp__highlights" />
            <KitSlot kind="product" name="description" className="gr-pdp__desc" />
            <KitSlot kind="product" name="info" className="gr-pdp__more" />
          </div>
        </div>
        <KitSlot kind="product" name="bundles" className="gr-pdp__band" />
        <KitSlot kind="product" name="related" className="gr-pdp__band" />
        <KitSlot kind="product" name="reviews" className="gr-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="gr-page" data-pagosya-product-page />
  </Shell>;
}
