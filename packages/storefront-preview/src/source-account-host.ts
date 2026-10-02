import { STOREFRONT_PAGES } from '@pagosya/shared-types';
/** The account iframe is a sibling of the opaque storefront, never its descendant. */
export const ACCOUNT_SOURCE_PAGES: Record<string, string> = Object.fromEntries(STOREFRONT_PAGES.filter(page => page.owner === 'account').map(page => [page.view!, page.url]));
const views: Record<string, string> = Object.fromEntries(STOREFRONT_PAGES.filter(page => page.owner === 'account').map(page => [page.key.split('/')[1], page.view!]));
type Options = { checkoutOrigin: string; slug: string; preview: boolean; branding: unknown; navigate: (page: string) => void };
export function mountSourceAccountHost(source: HTMLIFrameElement, options: Options): () => void {
  const origin = new URL(options.checkoutOrigin).origin;
  const controller = new AbortController();
  let layer: HTMLDivElement | null = null, account: HTMLIFrameElement | null = null, timer: number | undefined;
  let box: {left:number;top:number;width:number;height:number} | null = null;
  let view = '', height = 620;
  const position = () => {
    if (!layer || !box) return;
    if (!source.isConnected) { dispose(); return; }
    const r = source.getBoundingClientRect();
    const left = Math.max(r.left, r.left + box.left), top = Math.max(r.top, r.top + box.top);
    const right = Math.min(r.right, r.left + box.left + box.width), bottom = Math.min(r.bottom, r.top + box.top + height);
    layer.style.left = left + 'px'; layer.style.top = top + 'px';
    layer.style.width = Math.max(0, right-left) + 'px'; layer.style.height = Math.max(0,bottom-top) + 'px';
    if (account) { account.style.width = box.width + 'px'; account.style.height = height + 'px'; account.style.left = (r.left + box.left-left) + 'px'; account.style.top = (r.top + box.top-top) + 'px'; }
  };
  const clear = () => { clearTimeout(timer); layer?.remove(); layer = null; account = null; view = ''; box = null; };
  function dispose() { clear(); controller.abort(); observer.disconnect(); navigationObserver.disconnect(); }
  const observer = new MutationObserver(() => { if (!source.isConnected) dispose(); });
  observer.observe(document.body, {childList:true,subtree:true});
  const navigationObserver = new MutationObserver(clear);
  navigationObserver.observe(source, {attributes:true,attributeFilter:['srcdoc']});
  window.addEventListener('resize', position, {signal:controller.signal});
  window.addEventListener('scroll', position, {capture:true,signal:controller.signal});
  window.addEventListener('message', event => {
    if (event.source === source.contentWindow && event.origin === 'null' && event.data?.type === 'pagosya:account-slot') {
      const requested = !options.preview && event.data.view === 'reset-password' ? 'recuperar' : views[event.data.view], rect = event.data.rect;
      if (typeof requested !== 'string' || !rect || !['left','top','width','height'].every(key => Number.isFinite(rect[key]) && Math.abs(rect[key]) <= 100000) || rect.width <= 0) return;
      if (view && view !== requested) clear();
      box = rect; view = requested;
      if (!layer) {
        layer = document.createElement('div');
        layer.dataset.trustedAccount = '';
        layer.style.cssText = 'position:fixed;overflow:hidden;z-index:20;';
        const loading = document.createElement('p'); loading.setAttribute('role','status'); loading.textContent = 'Cargando formulario…'; layer.append(loading);
        account = document.createElement('iframe'); account.title = options.preview ? 'Vista previa de la cuenta' : 'Cuenta de la tienda';
        account.style.cssText = 'position:absolute;border:0;background:transparent;visibility:hidden;';
        account.referrerPolicy = 'no-referrer';
        // The URL and merchant come from the trusted host, not the authored message.
        const url = new URL(`/cuenta/${encodeURIComponent(options.slug)}/${view}`, origin);
        url.searchParams.set('account_embed', '1');
        if (options.preview) url.searchParams.set('account_preview', '1');
        url.hash = new URLSearchParams({parent_origin:location.origin}).toString();
        account.src = url.href; layer.append(account); document.body.append(layer);
        const armTimeout = () => {
          clearTimeout(timer);
          timer = window.setTimeout(() => {
            loading.textContent = 'No pudimos cargar la cuenta. ';
            const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Reintentar';
            retry.addEventListener('click', () => { if (account) { loading.textContent = 'Cargando formulario…'; account.src = url.href; armTimeout(); } });
            loading.append(retry);
          }, 15000);
        };
        armTimeout();
      }
      source.contentWindow?.postMessage({type:'pagosya:account-slot-size',height}, '*');
      position();
      return;
    }
    if (!account || event.source !== account.contentWindow || event.origin !== origin) return;
    if (event.data?.type === 'pagosya:account-scroll' && Number.isFinite(event.data.delta)) source.contentWindow?.postMessage({type:'pagosya:account-scroll',delta:Math.max(-1000,Math.min(1000,event.data.delta))}, '*');
    if (event.data?.type === 'pagosya:account-focus' && box && Number.isFinite(event.data.top) && Number.isFinite(event.data.bottom)) {
      const r = source.getBoundingClientRect();
      const top = r.top + box.top + event.data.top, bottom = r.top + box.top + event.data.bottom;
      const delta = bottom > r.bottom - 12 ? bottom - r.bottom + 12 : top < r.top + 12 ? top - r.top - 12 : 0;
      if (delta) source.contentWindow?.postMessage({type:'pagosya:account-scroll',delta:Math.max(-1000,Math.min(1000,delta))}, '*');
    }
    if (event.data?.type === 'pagosya:account-ready') {
      clearTimeout(timer); layer?.querySelector('p')?.remove(); account.style.visibility = 'visible';
      account.contentWindow?.postMessage({type:'pagosya:account-branding',branding:options.branding}, origin);
    }
    if (event.data?.type === 'pagosya:account-height' && Number.isFinite(event.data.height)) {
      height = Math.max(200,Math.min(2000,event.data.height));
      source.contentWindow?.postMessage({type:'pagosya:account-slot-size',height}, '*'); position();
    }
    if (event.data?.type === 'pagosya:account-navigate' && typeof ACCOUNT_SOURCE_PAGES[event.data.view] === 'string') options.navigate(ACCOUNT_SOURCE_PAGES[event.data.view]);
  }, {signal:controller.signal});
  window.addEventListener('pagehide', dispose, {once:true,signal:controller.signal});
  return dispose;
}
