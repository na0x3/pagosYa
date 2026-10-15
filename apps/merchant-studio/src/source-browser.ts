import { mountSourceAccountDemo } from './source-account-demo';
import { API_BASE_URL, ApiError, MerchantStudioApi, SESSION_STORAGE_KEY } from './api';
import { sourcePreviewDocument, receivePreviewNavigation, receivePreviewContact, openPreviewContact, createPreviewImageLoader, type SourceSnapshot } from '@pagosya/storefront-preview';
import { escapeHtml } from './studio-ui';
import './source-browser.css';
import { LOADER_STAR } from './source-loader-star';
import { bindSourcePaymentPreview } from './source-payment-preview';

/** Trusted full-window shell: authored source still runs only in an opaque iframe. */
export async function mountSourceBrowser(app: HTMLDivElement) {
  window.opener = null;
  const params = new URLSearchParams(location.search);
  const storeId = params.get('store') || '';
  const revision = Number(params.get('revision'));
  // Plantillas › Ver: the template as designed, on its demo shop, instead of a saved version.
  const templateId = params.get('template') || '';
  const page = params.get('page') || 'index.html';
  // «Ver en navegador» on a draft the editor shows (YAPI's unsaved work): that draft, on top of its saved revision.
  const draft = !templateId && params.get('draft') === '1';
  const cartKey = `pagosya_source_preview_cart:${storeId}:${templateId ? `template:${templateId}` : draft ? `draft:${revision}` : revision}`;
  app.className = 'source-browser';
  app.innerHTML = `<p class="source-browser-message source-browser-loading" role="status">${LOADER_STAR}<span>${templateId ? 'Abriendo la plantilla…' : 'Abriendo la vista previa…'}</span></p>`;
  try {
    const token = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!token) throw new Error(templateId ? 'Abre esta vista desde «Ver» en Plantillas.' : 'Abre esta vista desde «Ver en navegador» en el editor de tu tienda.');
    const api = new MerchantStudioApi(token);
    const { snapshot, title } = templateId ? await templateSnapshot(api, templateId) : draft ? await draftSnapshot(api, storeId, revision) : await versionSnapshot(api, storeId, revision);
    const hydrated = await createPreviewImageLoader(API_BASE_URL)(snapshot);
    let cart = [];
    try { cart = JSON.parse(sessionStorage.getItem(cartKey) || '[]'); } catch { /* Start with an empty preview cart. */ }
    const html = sourcePreviewDocument(hydrated, page, { query: params.get('query') || '', fragment: params.get('anchor') || '', cart: Array.isArray(cart) ? cart : [], paymentForm: true, accountForms: true });
    document.title = title;
    app.innerHTML = '<iframe title="Vista previa del sitio" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>';
    const frame = app.querySelector('iframe')!;
    bindSourcePaymentPreview(() => frame, () => hydrated);
    frame.srcdoc = html;
    mountSourceAccountDemo(frame);
    const controller = new AbortController();
    window.addEventListener('pagehide', () => controller.abort(), { once: true });
    window.addEventListener('message', event => {
      const contact = receivePreviewContact(event, frame); if (contact) { openPreviewContact(contact); return; }
      const next = receivePreviewNavigation(event, frame, hydrated);
      if (!next) return;
      sessionStorage.setItem(cartKey, JSON.stringify(next.cart || []));
      const destination = new URL(location.href);
      destination.searchParams.set('page', next.page); destination.searchParams.set('query', next.query || ''); destination.searchParams.set('anchor', next.fragment || '');
      if (next.newTab) {
        const tab = window.open(destination.href, '_blank');
        if (tab) { tab.opener = null; return; }
      }
      frame.srcdoc = sourcePreviewDocument(hydrated, next.page, { ...next, paymentForm: true, accountForms: true });
      history.replaceState(null, '', destination.href);
    }, { signal: controller.signal });
  } catch (error) {
    const message = error instanceof ApiError && error.status === 401
      ? (templateId ? 'Tu sesión venció. Inicia sesión en el panel y vuelve a usar «Ver» en Plantillas.' : 'Tu sesión venció. Inicia sesión en el editor y vuelve a usar «Ver en navegador».')
      : error instanceof Error ? error.message : 'No pudimos abrir la vista previa.';
    app.innerHTML = `<div class="source-browser-message"><p role="alert">${escapeHtml(message)}</p><button class="button" type="button">Reintentar</button></div>`;
    app.querySelector('button')!.addEventListener('click', () => void mountSourceBrowser(app));
  }
}

/**
 * The template as its designer made it, named after the template (a missing name list only costs the name). Dressed in
 * the merchant's store it kept its demo copy beside their name and photos and read as a broken store; "Usar" in the
 * Studio is where a template meets the store's products.
 */
async function templateSnapshot(api: MerchantStudioApi, templateId: string): Promise<{ snapshot: SourceSnapshot; title: string }> {
  const [snapshot, templates] = await Promise.all([api.templateDemo(templateId), api.listTemplates().catch(() => [])]);
  return { snapshot, title: `${templates.find(template => template.id === templateId)?.name || templateId} · Plantilla` };
}

/** A saved version; the live one shows today's catalog rather than the one it was saved with. */
async function versionSnapshot(api: MerchantStudioApi, storeId: string, revision: number): Promise<{ snapshot: SourceSnapshot; title: string }> {
  if (!storeId || !Number.isSafeInteger(revision) || revision < 1) throw new Error('El enlace de vista previa no es válido. Vuelve a abrirlo desde el editor.');
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
  return { snapshot, title: `${version.label} · Vista previa` };
}

/** The draft the editor shows, as it composes it: the draft's files over its saved revision, which keeps the photos
 *  the draft does not resend. The draft endpoint already carries the store's current catalog. */
async function draftSnapshot(api: MerchantStudioApi, storeId: string, revision: number): Promise<{ snapshot: SourceSnapshot; title: string }> {
  const [{ snapshot: base }, draft] = await Promise.all([versionSnapshot(api, storeId, revision), api.sourceDraftPreview(storeId)]);
  if (!draft.files?.length) throw new Error('Este borrador ya no está disponible. Vuelve al editor para ver el diseño guardado.');
  const kept = base.files.filter(file => file.encoding === 'base64' && !draft.files!.some(next => next.path === file.path));
  return { snapshot: { ...base, files: [...draft.files, ...kept] } as SourceSnapshot, title: 'Borrador de YAPI · Vista previa' };
}
