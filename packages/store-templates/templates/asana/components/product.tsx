import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="as-pdp">
        <div className="as-pdp__grid">
          <KitSlot kind="product" name="gallery" className="as-pdp__gallery" />
          <div className="as-pdp__info">
            <KitSlot kind="product" name="category" className="as-pdp__cat" />
            <KitSlot kind="product" name="title" className="as-pdp__title" />
            <KitSlot kind="product" name="pricing" className="as-pdp__price" />
            <KitSlot kind="product" name="buy" className="as-pdp__buy" />
            <KitSlot kind="product" name="description" className="as-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="as-pdp__highlights" />
            <details className="as-pdp__toggle" open>
              <summary>Tela y ajuste</summary>
              <KitSlot kind="product" name="info" className="as-pdp__more" />
            </details>
            <details className="as-pdp__toggle">
              <summary>Cuidado</summary>
              <p>Lava en frío con colores similares. No uses suavizante ni secadora: alarga la vida de la tela elástica.</p>
            </details>
            <KitSlot kind="product" name="delivery" className="as-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" className="as-pdp__band" />
        <KitSlot kind="product" name="reviews" className="as-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="as-page" data-pagosya-product-page />
  </Shell>;
}
