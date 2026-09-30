import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="tr-pdp">
        <div className="tr-pdp__grid">
          <KitSlot kind="product" name="gallery" className="tr-pdp__gallery" />
          <div className="tr-pdp__info">
            <KitSlot kind="product" name="category" className="tr-pdp__cat" />
            <KitSlot kind="product" name="title" className="tr-pdp__title" />
            <KitSlot kind="product" name="pricing" className="tr-pdp__price" />
            <KitSlot kind="product" name="buy" className="tr-pdp__buy" />
            <KitSlot kind="product" name="description" className="tr-pdp__desc" />
            <ul className="tr-pdp__facts">
              <li><b>Sin tóxicos</b><span>Pintura al agua apta para bebés</span></li>
              <li><b>Lijado a mano</b><span>Bordes suaves, sin astillas</span></li>
              <li><b>Cuidado de la madera</b><span>Límpialo con un paño húmedo</span></li>
            </ul>
            <KitSlot kind="product" name="highlights" className="tr-pdp__highlights" />
            <KitSlot kind="product" name="info" className="tr-pdp__more" />
            <KitSlot kind="product" name="delivery" className="tr-pdp__delivery" />
          </div>
        </div>
        <p className="tr-pdp__also">Otros para su edad</p>
        <KitSlot kind="product" name="related" className="tr-pdp__band" />
        <KitSlot kind="product" name="reviews" className="tr-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="tr-page" data-pagosya-product-page />
  </Shell>;
}
