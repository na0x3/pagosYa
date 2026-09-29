import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ob-pdp">
        <div className="ob-pdp__grid">
          <KitSlot kind="product" name="gallery" className="ob-pdp__gallery" />
          <div className="ob-pdp__info">
            <KitSlot kind="product" name="category" className="ob-pdp__cat" />
            <KitSlot kind="product" name="title" className="ob-pdp__title" />
            <KitSlot kind="product" name="pricing" className="ob-pdp__price" />
            <KitSlot kind="product" name="buy" className="ob-pdp__buy" />
            <KitSlot kind="product" name="description" className="ob-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="ob-pdp__highlights" />
            <KitSlot kind="product" name="info" className="ob-pdp__more" />
            <p className="ob-pdp__visit">Coordinamos la visita en 48 h.</p>
            <KitSlot kind="product" name="delivery" className="ob-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" className="ob-pdp__band" />
        <KitSlot kind="product" name="reviews" className="ob-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ob-page" data-pagosya-product-page />
  </Shell>;
}
