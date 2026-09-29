import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="pl-pdp">
        <div className="pl-pdp__grid">
          <KitSlot kind="product" name="gallery" className="pl-pdp__gallery" />
          <div className="pl-pdp__info">
            <KitSlot kind="product" name="category" className="pl-pdp__cat" />
            <KitSlot kind="product" name="title" className="pl-pdp__title" />
            <KitSlot kind="product" name="pricing" className="pl-pdp__price" />
            <KitSlot kind="product" name="buy" className="pl-pdp__buy" />
            <KitSlot kind="product" name="description" className="pl-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="pl-pdp__highlights" />
            <KitSlot kind="product" name="info" className="pl-pdp__more" />
            <KitSlot kind="product" name="delivery" className="pl-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" className="pl-pdp__band" />
        <KitSlot kind="product" name="reviews" className="pl-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="pl-page" data-pagosya-product-page />
  </Shell>;
}
