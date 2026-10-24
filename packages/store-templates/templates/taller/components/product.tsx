import Shell, { variant } from './Shell';
import { sections } from './store-data';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="es-pdp" data-es-pdp={variant('pdp', 'gallery-left')} data-es-pdp-order={variant('pdpOrder', 'story-first')}>
        <KitSlot kind="product" name="breadcrumb" className="es-pdp__crumbs" />
        <div className="es-pdp__grid">
          <KitSlot kind="product" name="gallery" className="es-pdp__gallery" />
          <div className="es-pdp__info">
            <KitSlot kind="product" name="title" className="es-pdp__title" />
            <KitSlot kind="product" name="category" className="es-pdp__category" />
            <KitSlot kind="product" name="rating" className="es-pdp__rating" />
            <KitSlot kind="product" name="pricing" className="es-pdp__price" />
            <KitSlot kind="product" name="description" className="es-pdp__desc" />
            {variant('pdp', 'gallery-left') === 'fashion' && sections.some(section => section.id === 'sizes') ? <a className="es-pdp__guide" href="index.html#sizes">Guía de tallas</a> : null}
            <KitSlot kind="product" name="buy" className="es-pdp__buy" />
            <KitSlot kind="product" name="highlights" className="es-pdp__highlights" />
            <KitSlot kind="product" name="delivery" className="es-pdp__delivery" />
            <KitSlot kind="product" name="info" className="es-pdp__more" />
          </div>
        </div>
        <div className="es-pdp__below">
          <KitSlot kind="product" name="reviews" className="es-pdp__reviews" />
          <KitSlot kind="product" name="related" className="es-pdp__related" />
        </div>
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="es-page" data-pagosya-product-page />
  </Shell>;
}
