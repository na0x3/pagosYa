import { API_BASE_URL, ApiError, MerchantStudioApi, SESSION_STORAGE_KEY } from './api';
import { sourcePreviewDocument, receivePreviewNavigation, createPreviewImageLoader } from '@pagosya/storefront-preview';
import { escapeHtml } from './studio-ui';
import './source-browser.css';
import { bindSourcePaymentPreview } from './source-payment-preview';

/** Trusted full-window shell: authored source still runs only in an opaque iframe. */
export async function mountSourceBrowser(app: HTMLDivElement) {
  window.opener = null;
  const params = new URLSearchParams(location.search);
  const storeId = params.get('store') || '';
  const revision = Number(params.get('revision'));
  const page = params.get('page') || 'index.html';
  const cartKey = `pagosya_source_preview_cart:${storeId}:${revision}`;
  app.className = 'source-browser';
  app.innerHTML = '<p class="source-browser-message" role="status">Abriendo la vista previa…</p>';
  try {
    const token = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!token) throw new Error('Abre esta vista desde «Ver en navegador» en el editor de tu tienda.');
    if (!storeId || !Number.isSafeInteger(revision) || revision < 1) throw new Error('El enlace de vista previa no es válido. Vuelve a abrirlo desde el editor.');
    const api = new MerchantStudioApi(token);
    const [version, state] = await Promise.all([api.sourceVersion(storeId, revision), api.sourceState(storeId)]);
    let snapshot = version.snapshot;
    if (state.revision === revision) {
      const catalog = await api.sourceCatalog(storeId);
      snapshot = { ...snapshot, files: snapshot.files.map(file => {
        if (file.path !== 'config.js') return file;
        try {
          const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
          if (!match) return file;
          const config = JSON.parse(match[1]);
          return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data: catalog })};` };
        } catch { return file; }
      }) };
    }
    const hydrated = await createPreviewImageLoader(API_BASE_URL)(snapshot);
    let cart = [];
    try { cart = JSON.parse(sessionStorage.getItem(cartKey) || '[]'); } catch { /* Start with an empty preview cart. */ }
    const html = sourcePreviewDocument(hydrated, page, { query: params.get('query') || '', fragment: params.get('anchor') || '', cart: Array.isArray(cart) ? cart : [], paymentForm: true });
    document.title = `${version.label} · Vista previa`;
    app.innerHTML = '<iframe title="Vista previa del sitio" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>';
    const frame = app.querySelector('iframe')!;
    bindSourcePaymentPreview(() => frame, () => hydrated);
    frame.srcdoc = html;
    const controller = new AbortController();
    window.addEventListener('pagehide', () => controller.abort(), { once: true });
    window.addEventListener('message', event => {
      const next = receivePreviewNavigation(event, frame, hydrated);
      if (!next) return;
      sessionStorage.setItem(cartKey, JSON.stringify(next.cart || []));
      const destination = new URL(location.href);
      destination.searchParams.set('page', next.page); destination.searchParams.set('query', next.query || ''); destination.searchParams.set('anchor', next.fragment || '');
      if (next.newTab) {
        const tab = window.open(destination.href, '_blank');
        if (tab) { tab.opener = null; return; }
      }
      frame.srcdoc = sourcePreviewDocument(hydrated, next.page, { ...next, paymentForm: true });
      history.replaceState(null, '', destination.href);
    }, { signal: controller.signal });
  } catch (error) {
    const message = error instanceof ApiError && error.status === 401
      ? 'Tu sesión venció. Inicia sesión en el editor y vuelve a usar «Ver en navegador».'
      : error instanceof Error ? error.message : 'No pudimos abrir la vista previa.';
    app.innerHTML = `<div class="source-browser-message"><p role="alert">${escapeHtml(message)}</p><button class="button" type="button">Reintentar</button></div>`;
    app.querySelector('button')!.addEventListener('click', () => void mountSourceBrowser(app));
  }
}
