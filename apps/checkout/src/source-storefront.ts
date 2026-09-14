import { sourceCanConfigureProduct, SOURCE_PRODUCT_OPTIONS_MARKER } from './source-product-capabilities';
import { createStoreFunnel } from './store-funnel';
import { markPrivateStorePage, refreshStoreSeo } from './store-seo';
import { privacy } from './privacy';
import { sourcePreviewDocument, receivePreviewNavigation, type SourceSnapshot, type PreviewNavigation } from '../../merchant-studio/src/source-preview';
import { createPreviewImageLoader } from '../../merchant-studio/src/source-preview-media';
import { API_BASE_URL, type Store } from './api';
import { sourceVisitorId, rememberSourceVisit } from './source-attribution';
import { storePartnerCode } from './partner-referral';

export async function mountPublishedSource(app: HTMLElement, slug: string, store: Store, onPayment: (secret: string) => Promise<void>, merchantPreview = false) {
  const visitorId = merchantPreview ? undefined : sourceVisitorId(slug);
  const url = `${API_BASE_URL}/stores/public/${encodeURIComponent(slug)}/source-site${visitorId ? '?visitorId=' + encodeURIComponent(visitorId) : ''}`;
  const response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error('No pudimos abrir esta tienda. Actualiza para intentar de nuevo.');
  const site = await response.json();
  if (!site.published) return false;
  const productRoute = /\/p\/([^/]+)\/?$/.exec(location.pathname)?.[1];
  const routedProduct = productRoute ? store.items.find(item => item.id === decodeURIComponent(productRoute)) : undefined;
  if (routedProduct && (!sourceCanConfigureProduct(routedProduct) || routedProduct.variants?.length && !site.snapshot?.files?.some((file: { path: string; content: string }) => file.path === 'commerce.js' && file.content.includes(SOURCE_PRODUCT_OPTIONS_MARKER)))) return false;
  rememberSourceVisit(slug, site.visitToken);
  const snapshot: SourceSnapshot = site.snapshot;
  const config = snapshot.files.find(f => f.path === 'config.js');
  if (!config) throw new Error('No se pudo cargar la configuración de esta tienda.');
  const match = config.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
  const settings = match ? JSON.parse(match[1]) : {};
  config.content = `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...settings, demo: false, slug, data: store, apiBaseUrl: API_BASE_URL, checkoutOrigin: location.origin })};`;
  const prepared = await createPreviewImageLoader(API_BASE_URL)(snapshot);
  if (!document.querySelector('link[rel=canonical]')) document.title = store.storeName;
  const frame = document.createElement('iframe');
  frame.title = store.storeName; frame.setAttribute('sandbox', 'allow-scripts allow-forms'); frame.referrerPolicy = 'no-referrer';
  frame.style.cssText = 'display:block;width:100%;height:100dvh;border:0;background:white';
  app.replaceChildren(frame);
  document.body.classList.add('source-store-page');
  const cartKey = `pagosya:source-cart:${slug}`;
  const themeKey = `pagosya:source-theme:${slug}`;
  let recoveryToken: string | undefined;
  try { recoveryToken = sessionStorage.getItem(`pagosya:recovery:${slug}`) || undefined; } catch {}
  const initialQuery = new URLSearchParams(location.search);
  const routeProduct = /\/p\/([^/]+)\/?$/.exec(location.pathname)?.[1];
  if (routeProduct) initialQuery.set('id', decodeURIComponent(routeProduct));
  let navigation: Partial<PreviewNavigation> = { query: '?' + initialQuery };
  try { const theme = sessionStorage.getItem(themeKey); if (theme === 'light' || theme === 'dark') navigation.theme = theme; } catch {}
  try { navigation.cart = JSON.parse(sessionStorage.getItem(cartKey) || '[]'); } catch {}
  const show = (page = 'index.html') => { frame.srcdoc = sourcePreviewDocument(prepared, page, { ...navigation, hosted: true }); };
  const funnel = createStoreFunnel(slug, merchantPreview);
  funnel.track('visit');
  const consentChanged = (event: Event) => { if ((event as CustomEvent).detail?.slug === slug) funnel.track('visit'); };
  window.addEventListener('pagosya:privacy-change', consentChanged);
  const pending = new Set<string>();
  const receive = async (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== 'null' || !frame.isConnected) return;
    const next = receivePreviewNavigation(event, frame, prepared);
    if (next) {
      navigation = { ...next, theme: next.theme || navigation.theme };
      try { sessionStorage.setItem(cartKey, JSON.stringify(next.cart || [])); } catch {}
      try { if (navigation.theme) sessionStorage.setItem(themeKey, navigation.theme); } catch {}
      if (!merchantPreview) {
        const destination = new URL(location.href); const params = new URLSearchParams(next.query || '');
        const product = next.page === (settings.productPage || 'product.html') ? params.get('id') : null;
        const privatePage = next.page === (settings.checkoutPage || 'checkout.html');
        const home = location.pathname.startsWith('/s/') ? `/s/${encodeURIComponent(slug)}` : '/';
        destination.pathname = product ? `${home.replace(/\/$/, '')}/p/${encodeURIComponent(product)}` : home;
        destination.searchParams.delete('source_page'); destination.searchParams.delete('id');
        if (!product && next.page !== 'index.html' && !privatePage) destination.searchParams.set('source_page', next.page);
        destination.hash = next.fragment || '';
        window.history.replaceState(window.history.state, '', destination);
        if (privatePage) markPrivateStorePage();
        else void refreshStoreSeo(slug, product || undefined, product ? undefined : next.page);
      }
      show(next.page); return;
    }
    const data = event.data;
    if (data?.type === 'pagosya:source-theme') {
      if (data.theme === 'light' || data.theme === 'dark') {
        navigation.theme = data.theme;
        try { sessionStorage.setItem(themeKey, data.theme); } catch {}
      }
      return;
    }
    if (data?.type === 'pagosya:funnel') { funnel.track(data.event, data.method); return; }
    if (data?.type === 'pagosya:source-external' && typeof data.url === 'string') {
      try {
        const url = new URL(data.url);
        const phone = String(store.contactPhone || '').replace(/\D/g, '');
        const product = store.items.find(item => url.pathname === `/s/${encodeURIComponent(slug)}/p/${encodeURIComponent(item.id)}`);
        const apiOrigin = new URL(API_BASE_URL, location.origin);
        const articlePrefix = `${apiOrigin.pathname.replace(/\/$/, '')}/stores/public/${encodeURIComponent(slug)}/pages/`;
        const article = url.origin === apiOrigin.origin && url.pathname.startsWith(articlePrefix) && /^[a-z]{2}(?:-[A-Z]{2})?\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname.slice(articlePrefix.length));
        const allowed = article || (url.origin === location.origin && product) || (url.origin === 'https://wa.me' && url.pathname === '/' + phone && phone) || (store.checkoutMode === 'external' && url.href === store.leadCaptureUrl);
        if (allowed && ['https:', 'http:'].includes(url.protocol)) location.assign(url.href);
      } catch {}
      return;
    }
    if (data?.type !== 'pagosya:hosted-request' || !Number.isSafeInteger(data.id) || !['checkout', 'lead', 'catalog', 'shipping', 'content', 'review', 'retention'].includes(data.action)) return;
    const target = event.source as Window;
    const reply = (ok: boolean, body: unknown) => target.postMessage({ type: 'pagosya:hosted-response', id: data.id, result: { ok, body } }, '*');
    if (pending.has(data.action)) { reply(false, { message: 'Ya hay una solicitud en curso.' }); return; }
    pending.add(data.action);
    try {
      if (data.action === 'catalog') { reply(true, store); return; }
      const body = data.body && typeof data.body === 'object' ? data.body : {};
      if (data.action === 'retention') {
        const path = typeof body.path === 'string' ? body.path : '';
        const read = path === '' || /^(cards|carts)\/[a-f0-9]{64}$/.test(path);
        const write = ['subscribe', 'cards', 'carts'].includes(path) || /^unsubscribe\/[a-f0-9-]{36}$/.test(path);
        if ((!read && !write) || (read && body.payload)) throw new Error('Solicitud no válida.');
        const result = await fetch(`${API_BASE_URL}/stores/public/${encodeURIComponent(slug)}/retention${path ? '/' + path : ''}`, { method: read ? 'GET' : 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, ...(read ? {} : { body: JSON.stringify(body.payload || {}) }), signal: AbortSignal.timeout(18000) });
        const json = await result.json();
        if (result.ok && path === 'carts' && /^[a-f0-9]{64}$/.test(json.token)) { recoveryToken = json.token; try { sessionStorage.setItem(`pagosya:recovery:${slug}`, recoveryToken!); } catch {} }
        reply(result.ok, json); return;
      }
      const checkout = data.action === 'checkout';
      const shipping = data.action === 'shipping', content = data.action === 'content', review = data.action === 'review';
      const payload = checkout || shipping ? { funnelToken: checkout ? funnel.token() : undefined, items: body.items, recoveryToken: body.recoveryToken || recoveryToken, creditCode: body.creditCode, locationId: body.locationId, fulfillmentMethod: body.fulfillmentMethod, shippingCountry: body.shippingCountry, shippingPostalCode: body.shippingPostalCode, shippingZoneId: body.shippingZoneId, shippingAddress: body.shippingAddress, sourceVisitToken: checkout && privacy.analyticsAllowed(slug) ? site.visitToken || undefined : undefined, partnerCode: checkout ? storePartnerCode(slug) : undefined }
        : review ? { trackingToken: body.trackingToken, productId: body.productId, displayName: body.displayName, rating: body.rating, body: body.body }
        : { items: [], name: body.name, email: body.email, phone: body.phone, message: body.message };
      const endpoint = checkout ? 'cart-checkout' : shipping ? 'shipping/quote' : review ? 'content/reviews' : content ? `content?locale=${encodeURIComponent(typeof body.locale === 'string' ? body.locale.slice(0, 8) : 'es')}` : 'leads';
      const result = await fetch(`${API_BASE_URL}/stores/public/${encodeURIComponent(slug)}/${endpoint}`, { method: content ? 'GET' : 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, ...(content ? {} : { body: JSON.stringify(payload) }), signal: AbortSignal.timeout(18000) });
      const json = await result.json();
      if (!result.ok) { reply(false, { message: json.message || 'No se pudo completar la solicitud.' }); return; }
      if (checkout) {
        if (typeof json.clientSecret !== 'string' || !json.clientSecret) throw new Error('No se pudo abrir el pago. Intenta de nuevo.');
        reply(true, {}); window.removeEventListener('message', receive);
        try { sessionStorage.removeItem(cartKey); } catch {}
        document.body.classList.remove('source-store-page');
        window.history.replaceState({ ...(window.history.state || {}), pagosYaCheckout: { clientSecret: json.clientSecret } }, '', location.href);
        markPrivateStorePage();
        await onPayment(json.clientSecret);
      } else reply(true, shipping || content ? json : { submitted: true });
    } catch (error) { reply(false, { message: error instanceof Error ? error.message : 'No se pudo completar la solicitud.' }); }
    finally { pending.delete(data.action); }
  };
  window.addEventListener('message', receive);
  window.addEventListener('pagehide', () => { window.removeEventListener('message', receive); window.removeEventListener('pagosya:privacy-change', consentChanged); }, { once: true });
  const requestedPage = new URLSearchParams(location.search).get('source_page');
  show(routeProduct && prepared.files.some(f => f.path === (settings.productPage || 'product.html')) ? settings.productPage || 'product.html' : requestedPage && prepared.files.some(f => f.path === requestedPage && f.path.endsWith('.html')) ? requestedPage : 'index.html');
  privacy.mount(slug, { analyticsAvailable: site.analyticsAvailable === true, preview: merchantPreview });
  return true;
}
