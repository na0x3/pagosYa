import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ac-pdp">
        <div className="ac-pdp__grid">
          <div className="ac-pdp__stage">
            <KitSlot kind="product" name="gallery" className="ac-pdp__gallery" />
          </div>
          <div className="ac-pdp__info">
            <KitSlot kind="product" name="category" className="ac-pdp__cat" />
            <KitSlot kind="product" name="title" className="ac-pdp__title" />
            <KitSlot kind="product" name="pricing" className="ac-pdp__price" />
            <KitSlot kind="product" name="buy" className="ac-pdp__buy" />
            <KitSlot kind="product" name="description" className="ac-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="ac-pdp__highlights" />
            <div className="ac-pdp__box">
              <p className="ac-pdp__box-title">Qué incluye</p>
              <KitSlot kind="product" name="info" className="ac-pdp__more" />
            </div>
            <KitSlot kind="product" name="delivery" className="ac-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" className="ac-pdp__band" />
        <KitSlot kind="product" name="reviews" className="ac-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ac-page" data-pagosya-product-page />
  </Shell>;
}
