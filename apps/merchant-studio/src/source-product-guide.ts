import { inheritResourceTheme } from './source-resource-theme';
import { MerchantStudioApi, SESSION_STORAGE_KEY } from './api';
import { createProductForm, type ProductGuideRecord } from './source-create-product';
import './source-library.css';

export function mountProductGuide(app: HTMLDivElement) {
  inheritResourceTheme();
  document.body.className = 'store-resource-body product-guide-body';
  const storeId = new URLSearchParams(location.search).get('store') || '';
  const api = new MerchantStudioApi(sessionStorage.getItem(SESSION_STORAGE_KEY) || '');
  let form: ReturnType<typeof createProductForm> | undefined, saved = false;
  function start(initial?: ProductGuideRecord) {
    form?.dispose(); saved = false;
    form = createProductForm(api, storeId, () => {
      saved = true;
      window.parent.postMessage({ type: 'pagosya:product-saved', storeId }, location.origin);
    }, () => {
      if (!canLeave()) return;
      start();
    }, initial);
    app.replaceChildren(form.element);
  }
  function canLeave() {
    if (form?.isBusy) return false;
    return saved || !form?.hasChanges || window.confirm('¿Descartar las respuestas de este producto?');
  }
  (window as Window & { pagosyaStudioCanLeave?: () => boolean }).pagosyaStudioCanLeave = canLeave;
  if (window.parent === window) window.addEventListener('beforeunload', event => { if (!saved && (form?.isBusy || form?.hasChanges)) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'pagosya:product-guide-edit' && event.data.storeId === storeId && event.data.product?.id && canLeave()) start(event.data.product);
    if (event.data?.type === 'pagosya:product-guide-new' && canLeave()) { start(); form?.focus(); }
    if (event.data?.type === 'pagosya:product-guide-focus') { if (saved) start(); form?.focus(); }
  });
  new ResizeObserver(() => window.parent.postMessage({ type: 'pagosya:resource-height', storeId, height: app.scrollHeight + 28 }, location.origin)).observe(app);
  start();
  window.parent.postMessage({type:'pagosya:product-guide-ready',storeId}, location.origin);
}
