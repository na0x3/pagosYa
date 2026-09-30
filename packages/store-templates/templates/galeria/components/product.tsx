import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';
import { photos } from './store-data';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="ga-pdp">
        <div className="ga-pdp__grid">
          <div className="ga-pdp__left">
            <KitSlot kind="product" name="gallery" className="ga-pdp__gallery" />
            <figure className="ga-pdp__wall">
              <img src={photos.pared} alt="Una obra enmarcada sobre un sofá beige en una sala luminosa" />
              <figcaption>Así se ve una obra sobre tu pared</figcaption>
            </figure>
          </div>
          <div className="ga-pdp__info">
            <KitSlot kind="product" name="category" className="ga-pdp__cat" />
            <KitSlot kind="product" name="title" className="ga-pdp__title" />
            <KitSlot kind="product" name="pricing" className="ga-pdp__price" />
            <KitSlot kind="product" name="buy" className="ga-pdp__buy" />
            <KitSlot kind="product" name="description" className="ga-pdp__desc" />
            <KitSlot kind="product" name="highlights" className="ga-pdp__highlights" />
            <ul className="ga-pdp__notes">
              <li><b>Certificado</b><span>Cada obra original lleva certificado de autenticidad firmado.</span></li>
              <li><b>Enmarcado</b><span>Puedes recibirla con marco de madera o sin marco, enrollada.</span></li>
            </ul>
            <KitSlot kind="product" name="info" className="ga-pdp__more" />
            <KitSlot kind="product" name="delivery" className="ga-pdp__delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" className="ga-pdp__band" />
        <KitSlot kind="product" name="reviews" className="ga-pdp__band" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="ga-page" data-pagosya-product-page />
  </Shell>;
}
