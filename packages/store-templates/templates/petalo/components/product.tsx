import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="pe-pdp">
        <div className="pe-pdp__grid">
          <div className="pe-pdp__stage">
            <KitSlot kind="product" name="gallery" className="pe-pdp__gallery" />
          </div>
          <div className="pe-pdp__info">
            <KitSlot kind="product" name="category" className="pe-pdp__cat" />
            <KitSlot kind="product" name="title" className="pe-pdp__title" />
            <KitSlot kind="product" name="pricing" className="pe-pdp__price" />
            <KitSlot kind="product" name="buy" className="pe-pdp__buy" />
            <KitSlot kind="product" name="description" className="pe-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="pe-pdp__highlights" />
            <div className="pe-pdp__card">
              <p className="pe-pdp__card-title">Ingredientes y modo de uso</p>
              <KitSlot kind="product" name="info" className="pe-pdp__more" />
              <p className="pe-pdp__how">Aplica sobre la piel limpia, mañana y noche, con movimientos suaves hacia arriba.</p>
            </div>
            <KitSlot kind="product" name="delivery" className="pe-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" className="pe-pdp__band" />
        <KitSlot kind="product" name="reviews" className="pe-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="pe-page" data-pagosya-product-page />
  </Shell>;
}
