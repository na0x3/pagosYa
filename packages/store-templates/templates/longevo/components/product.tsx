import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="lg-pdp">
        <div className="lg-pdp__grid">
          <div className="lg-pdp__stage">
            <KitSlot kind="product" name="gallery" className="lg-pdp__gallery" />
          </div>
          <div className="lg-pdp__info">
            <KitSlot kind="product" name="category" className="lg-pdp__cat" />
            <KitSlot kind="product" name="title" className="lg-pdp__title" />
            <KitSlot kind="product" name="pricing" className="lg-pdp__price" />
            <KitSlot kind="product" name="buy" className="lg-pdp__buy" />
            <KitSlot kind="product" name="description" className="lg-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="lg-pdp__highlights" />
            <details className="lg-pdp__toggle" open>
              <summary>Ingredientes, modo de uso y advertencias</summary>
              <KitSlot kind="product" name="info" className="lg-pdp__more" />
            </details>
            <details className="lg-pdp__toggle">
              <summary>Envíos</summary>
              <p>Enviamos en 2 a 5 días hábiles. Consulta a tu médico antes de usar cualquier suplemento.</p>
              <KitSlot kind="product" name="delivery" className="lg-pdp__delivery" />
            </details>
          </div>
        </div>
        <KitSlot kind="product" name="related" className="lg-pdp__band" />
        <KitSlot kind="product" name="reviews" className="lg-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="lg-page" data-pagosya-product-page />
  </Shell>;
}
