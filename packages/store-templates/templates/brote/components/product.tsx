import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="br-pdp">
        <KitSlot kind="product" name="breadcrumb" className="br-pdp__crumbs" />
        <div className="br-pdp__grid">
          <KitSlot kind="product" name="gallery" className="br-pdp__gallery" />
          <div className="br-pdp__info">
            <KitSlot kind="product" name="category" className="br-pdp__cat" />
            <KitSlot kind="product" name="title" className="br-pdp__title" />
            <KitSlot kind="product" name="rating" className="br-pdp__rating" />
            <KitSlot kind="product" name="pricing" className="br-pdp__price" />
            <KitSlot kind="product" name="highlights" className="br-pdp__chips" />
            <KitSlot kind="product" name="buy" className="br-pdp__buy" />
            <KitSlot kind="product" name="description" className="br-pdp__desc" />
            <div className="br-pdp__how">
              <h2 className="br-pdp__how-title">Cómo usar</h2>
              <KitSlot kind="product" name="info" className="br-pdp__more" />
            </div>
            <KitSlot kind="product" name="delivery" className="br-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="bundles" className="br-pdp__band" />
        <KitSlot kind="product" name="related" className="br-pdp__band" />
        <KitSlot kind="product" name="reviews" className="br-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="br-page" data-pagosya-product-page />
  </Shell>;
}
