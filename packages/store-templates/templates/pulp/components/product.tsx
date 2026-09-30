import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="pu-pdp">
        <div className="pu-pdp__grid">
          <div className="pu-pdp__cover">
            <KitSlot kind="product" name="gallery" className="pu-pdp__gallery" />
          </div>
          <div className="pu-pdp__info">
            <KitSlot kind="product" name="category" className="pu-pdp__cat" />
            <KitSlot kind="product" name="title" className="pu-pdp__title" />
            <KitSlot kind="product" name="pricing" className="pu-pdp__price" />
            <KitSlot kind="product" name="buy" className="pu-pdp__buy" />
            <KitSlot kind="product" name="description" className="pu-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="pu-pdp__highlights" />
            <div className="pu-pdp__sheet">
              <p className="pu-pdp__sheet-title">Ficha técnica</p>
              <KitSlot kind="product" name="info" className="pu-pdp__more" />
              <KitSlot kind="product" name="delivery" className="pu-pdp__delivery" />
            </div>
          </div>
        </div>
        <KitSlot kind="product" name="related" className="pu-pdp__band" />
        <KitSlot kind="product" name="reviews" className="pu-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="pu-page" data-pagosya-product-page />
  </Shell>;
}
