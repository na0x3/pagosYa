import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ru-pdp">
        <KitSlot kind="product" name="breadcrumb" className="ru-pdp__crumbs" />
        <div className="ru-pdp__grid">
          <KitSlot kind="product" name="gallery" className="ru-pdp__gallery" />
          <div className="ru-pdp__info">
            <KitSlot kind="product" name="category" className="ru-pdp__cat" />
            <KitSlot kind="product" name="title" className="ru-pdp__title" />
            <KitSlot kind="product" name="rating" className="ru-pdp__rating" />
            <KitSlot kind="product" name="pricing" className="ru-pdp__price" />
            <KitSlot kind="product" name="highlights" className="ru-pdp__chips" />
            <KitSlot kind="product" name="buy" className="ru-pdp__buy" />
            <KitSlot kind="product" name="description" className="ru-pdp__desc" />
            <div className="ru-pdp__ingredients">
              <p className="ru-pdp__ingredients-title">ingredientes y detalles<span className="ru-dot">.</span></p>
              <KitSlot kind="product" name="info" className="ru-pdp__info-slot" />
            </div>
            <KitSlot kind="product" name="delivery" className="ru-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="bundles" className="ru-pdp__band" />
        <KitSlot kind="product" name="related" className="ru-pdp__band" />
        <KitSlot kind="product" name="reviews" className="ru-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ru-page" data-pagosya-product-page />
  </Shell>;
}
