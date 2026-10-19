import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="es-pdp">
        <KitSlot kind="product" name="breadcrumb" className="es-pdp__crumbs" />
        <div className="es-pdp__grid">
          <KitSlot kind="product" name="gallery" className="es-pdp__gallery" />
          <div className="es-pdp__info">
            <KitSlot kind="product" name="title" className="es-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="es-pdp__price" />
            <KitSlot kind="product" name="description" className="es-pdp__desc" />
            <KitSlot kind="product" name="buy" />
            <KitSlot kind="product" name="highlights" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="es-page" data-pagosya-product-page />
  </Shell>;
}
