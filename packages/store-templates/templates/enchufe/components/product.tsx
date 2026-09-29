import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ec-pdp">
        <KitSlot kind="product" name="breadcrumb" className="ec-pdp__crumbs" />
        <div className="ec-pdp__grid">
          <div className="ec-pdp__stage">
            <KitSlot kind="product" name="gallery" className="ec-pdp__gallery" />
          </div>
          <div className="ec-pdp__info">
            <KitSlot kind="product" name="category" className="ec-pdp__cat" />
            <KitSlot kind="product" name="title" className="ec-pdp__title" />
            <KitSlot kind="product" name="rating" className="ec-pdp__rating" />
            <KitSlot kind="product" name="pricing" className="ec-pdp__price" />
            <KitSlot kind="product" name="buy" className="ec-pdp__buy" />
            <KitSlot kind="product" name="highlights" className="ec-pdp__specs" />
            <KitSlot kind="product" name="description" className="ec-pdp__desc" />
            <div className="ec-pdp__box">
              <p className="ec-pdp__box-title">Qué incluye</p>
              <KitSlot kind="product" name="info" className="ec-pdp__included" />
            </div>
            <KitSlot kind="product" name="delivery" className="ec-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="bundles" className="ec-pdp__band" />
        <KitSlot kind="product" name="related" className="ec-pdp__band" />
        <KitSlot kind="product" name="reviews" className="ec-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ec-page" data-pagosya-product-page />
  </Shell>;
}
