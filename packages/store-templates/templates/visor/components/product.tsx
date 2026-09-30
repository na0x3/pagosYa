import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="vi-pdp">
        <div className="vi-pdp__grid">
          <div className="vi-pdp__stage">
            <KitSlot kind="product" name="gallery" className="vi-pdp__gallery" />
          </div>
          <div className="vi-pdp__info">
            <KitSlot kind="product" name="category" className="vi-pdp__cat" />
            <KitSlot kind="product" name="title" className="vi-pdp__title" />
            <KitSlot kind="product" name="pricing" className="vi-pdp__price" />
            <KitSlot kind="product" name="buy" className="vi-pdp__buy" />
            <KitSlot kind="product" name="description" className="vi-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="vi-pdp__highlights" />
            <div className="vi-pdp__specs">
              <p className="vi-pdp__specs-title">Ficha técnica</p>
              <KitSlot kind="product" name="info" className="vi-pdp__more" />
            </div>
            <KitSlot kind="product" name="delivery" className="vi-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" className="vi-pdp__band" />
        <KitSlot kind="product" name="reviews" className="vi-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="vi-page" data-pagosya-product-page />
  </Shell>;
}
