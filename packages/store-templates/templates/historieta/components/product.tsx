import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="hi-pdp">
        <div className="hi-pdp__grid">
          <div className="hi-pdp__cover">
            <span className="hi-pdp__sticker" aria-hidden="true">Nuevo</span>
            <KitSlot kind="product" name="gallery" className="hi-pdp__gallery" />
          </div>
          <div className="hi-pdp__info">
            <KitSlot kind="product" name="category" className="hi-pdp__cat" />
            <KitSlot kind="product" name="title" className="hi-pdp__title" />
            <KitSlot kind="product" name="pricing" className="hi-pdp__price" />
            <KitSlot kind="product" name="buy" className="hi-pdp__buy" />
            <KitSlot kind="product" name="description" className="hi-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="hi-pdp__highlights" />
            <div className="hi-pdp__sheet">
              <p className="hi-pdp__sheet-title">Ficha</p>
              <KitSlot kind="product" name="info" className="hi-pdp__more" />
              <KitSlot kind="product" name="delivery" className="hi-pdp__delivery" />
            </div>
          </div>
        </div>
        <p className="hi-pdp__also">Te puede gustar</p>
        <KitSlot kind="product" name="related" className="hi-pdp__band" />
        <KitSlot kind="product" name="reviews" className="hi-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="hi-page" data-pagosya-product-page />
  </Shell>;
}
