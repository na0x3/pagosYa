import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

const trust = ['Pago seguro con QR o tarjeta', 'Envío a todo el país', 'Cambios sin complicaciones'];

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="so-pdp">
        <KitSlot kind="product" name="breadcrumb" className="so-pdp__crumbs" />
        <div className="so-pdp__grid">
          <KitSlot kind="product" name="gallery" className="so-pdp__gallery" />
          <div className="so-pdp__info">
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="title" className="so-pdp__title" />
            <KitSlot kind="product" name="description" className="so-pdp__desc" />
            <KitSlot kind="product" name="pricing" className="so-pdp__price" />
            <KitSlot kind="product" name="buy" className="so-pdp__buy" />
            <ul className="so-trust">{trust.map(item => <li key={item}>{item}</li>)}</ul>
            <KitSlot kind="product" name="highlights" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="bundles" />
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="so-page" data-pagosya-product-page />
  </Shell>;
}
