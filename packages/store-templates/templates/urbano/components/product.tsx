import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ur-pdp">
        <div className="ur-pdp__grid">
          <KitSlot kind="product" name="gallery" className="ur-pdp__gallery" />
          <div className="ur-pdp__info">
            <KitSlot kind="product" name="breadcrumb" className="ur-mono" />
            <KitSlot kind="product" name="title" className="ur-pdp__title" />
            <KitSlot kind="product" name="pricing" className="ur-pdp__price" />
            <KitSlot kind="product" name="buy" />
            <KitSlot kind="product" name="description" className="ur-pdp__desc" />
            <KitSlot kind="product" name="highlights" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
            <KitSlot kind="product" name="rating" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ur-page" data-pagosya-product-page />
  </Shell>;
}
