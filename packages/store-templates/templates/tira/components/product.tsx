import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ti-pdp">
        <div className="ti-pdp__grid">
          <div className="ti-pdp__cover">
            <KitSlot kind="product" name="gallery" className="ti-pdp__gallery" />
          </div>
          <div className="ti-pdp__info">
            <KitSlot kind="product" name="category" className="ti-pdp__cat" />
            <KitSlot kind="product" name="title" className="ti-pdp__title" />
            <KitSlot kind="product" name="pricing" className="ti-pdp__price" />
            <KitSlot kind="product" name="buy" className="ti-pdp__buy" />
            <KitSlot kind="product" name="description" className="ti-pdp__desc" />
            <ul className="ti-pdp__chips">
              <li>Formato de bolsillo</li>
              <li>Idioma: español</li>
              <li>Envío en funda</li>
            </ul>
            <KitSlot kind="product" name="highlights" className="ti-pdp__highlights" />
            <KitSlot kind="product" name="info" className="ti-pdp__more" />
            <KitSlot kind="product" name="delivery" className="ti-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" className="ti-pdp__band" />
        <KitSlot kind="product" name="reviews" className="ti-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ti-page" data-pagosya-product-page />
  </Shell>;
}
