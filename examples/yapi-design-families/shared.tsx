import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { StoreTheme, PageEntrance, SiteHeader, SiteFooter, CommerceSlots, ProductDetail, CheckoutDetail } from '@pagosya/ui';
import Home, { design } from 'family';

const route = location.pathname.endsWith('product.html') ? 'product' : location.pathname.endsWith('checkout.html') ? 'checkout' : 'home';
window.PAGOSYA_CONFIG = {
  demo: true, slug: design.id, motion: new URLSearchParams(location.search).get('motion') === 'off' ? 'off' : 'auto', scrollFeel: design.id === 'product-cinematic' ? 'cinematic' : 'soft', productPage: 'product.html', checkoutPage: 'checkout.html', productPageStyle: design.productPageStyle,
  apiBaseUrl: location.origin, checkoutOrigin: location.origin,
  data: { storeName: design.name, tagline: design.tagline, items: design.items, categories: [], locations: [], checkoutMode: 'payment', shippingEnabled: false },
};
flushSync(() => createRoot(document.getElementById('app')!).render(<StoreTheme tokens={design.tokens}>
  {route === 'home' && design.id !== 'beauty-editorial' ? <PageEntrance variant={design.id === 'cafe-expressive' ? 'stroke' : 'curtain'} mark={design.name[0]} /> : null}
  <div className="demo-banner"><a href="../">YAPI · Colección de diseños</a><span>Tienda de ejemplo · Sin cobros</span>{route === 'home' ? <button type="button" onClick={() => { window.scrollTo({ top: 0, behavior: 'instant' }); requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('pagosya:replay-motion'))); }}>Repetir entrada</button> : null}</div>
  <SiteHeader menu={design.id === 'cafe-expressive' ? 'overlay' : 'panel'} name={design.name} tagline={design.tagline} variant={design.header} links={[{ label: 'Colección', href: 'index.html#productos' }, { label: 'Nuestra mirada', href: 'index.html#historia' }]} />
  {route === 'product' ? <ProductDetail /> : route === 'checkout' ? <CheckoutDetail /> : <Home />}
  <SiteFooter name={design.name} blurb={design.tagline} note="Diseño de muestra · pagosYa" tone={design.footer} columns={[{ title: 'Explora', links: [{ label: 'Colección', href: 'index.html#productos' }, { label: 'Volver a los diseños', href: '../' }] }]} />
  <CommerceSlots />
</StoreTheme>));
const runtime = document.createElement('script');
runtime.src = '../commerce.js';
document.body.append(runtime);
