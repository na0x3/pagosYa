import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="af-pdp">
        <div className="af-pdp__grid">
          <div className="af-pdp__stage">
            <span className="af-pdp__blob" aria-hidden="true" />
            <KitSlot kind="product" name="gallery" className="af-pdp__gallery" />
          </div>
          <div className="af-pdp__info">
            <KitSlot kind="product" name="category" className="af-pdp__cat" />
            <KitSlot kind="product" name="title" className="af-pdp__title" />
            <KitSlot kind="product" name="pricing" className="af-pdp__price" />
            <KitSlot kind="product" name="buy" className="af-pdp__buy" />
            <KitSlot kind="product" name="description" className="af-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="af-pdp__highlights" />
            <dl className="af-pdp__facts">
              <div><dt>Uso</dt><dd>Apto para alimentos y microondas</dd></div>
              <div><dt>Lavado</dt><dd>A mano o en lavavajillas suave</dd></div>
              <div><dt>Hecha</dt><dd>A mano, cada pieza es única</dd></div>
            </dl>
            <KitSlot kind="product" name="info" className="af-pdp__more" />
            <KitSlot kind="product" name="delivery" className="af-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" className="af-pdp__band" />
        <KitSlot kind="product" name="reviews" className="af-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="af-page" data-pagosya-product-page />
  </Shell>;
}
