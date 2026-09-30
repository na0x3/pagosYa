import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="at-pdp">
        <div className="at-pdp__grid">
          <KitSlot kind="product" name="gallery" className="at-pdp__gallery" />
          <div className="at-pdp__info">
            <KitSlot kind="product" name="category" className="at-pdp__cat" />
            <KitSlot kind="product" name="title" className="at-pdp__title" />
            <KitSlot kind="product" name="pricing" className="at-pdp__price" />
            <KitSlot kind="product" name="buy" className="at-pdp__buy" />
            <KitSlot kind="product" name="description" className="at-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="at-pdp__highlights" />
            <details className="at-pdp__toggle" open>
              <summary>Materiales y medidas</summary>
              <KitSlot kind="product" name="info" className="at-pdp__more" />
            </details>
            <details className="at-pdp__toggle">
              <summary>Cuidado</summary>
              <p>Limpia con un paño seco. Nútrelo dos veces al año con cera de abeja y evita la humedad directa.</p>
            </details>
            <KitSlot kind="product" name="delivery" className="at-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" className="at-pdp__band" />
        <KitSlot kind="product" name="reviews" className="at-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="at-page" data-pagosya-product-page />
  </Shell>;
}
