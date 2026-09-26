import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="pi-pdp">
        <KitSlot kind="product" name="breadcrumb" className="pi-pdp__crumbs" />
        <div className="pi-pdp__grid">
          <KitSlot kind="product" name="gallery" className="pi-pdp__gallery" />
          <div className="pi-pdp__info">
            <KitSlot kind="product" name="category" className="pi-pdp__cat" />
            <KitSlot kind="product" name="title" className="pi-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="pi-pdp__price" />
            <KitSlot kind="product" name="description" className="pi-pdp__desc" />
            <KitSlot kind="product" name="buy" className="pi-pdp__buy" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="pi-page" data-pagosya-product-page />
  </Shell>;
}
