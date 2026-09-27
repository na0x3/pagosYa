import { MerchantStudioApi, SESSION_STORAGE_KEY } from './api';
import { openTemplateGallery } from './source-templates';

/** The dashboard's Plantillas tab: the gallery as a page for the store in the URL. Applying a template tells the
 * dashboard, which opens the design editor on the new revision. */
export async function mountTemplatesPage(app: HTMLElement) {
  // The editor's style.css pins html/body to the viewport with overflow hidden; this page scrolls inside the
  // dashboard frame and shows the dashboard's background through it (source-templates.css, .tpl-page-doc).
  document.documentElement.classList.add('tpl-page-doc');
  const storeId = new URLSearchParams(location.search).get('store') || '';
  const api = new MerchantStudioApi(sessionStorage.getItem(SESSION_STORAGE_KEY) || '');
  const post = (message: Record<string, unknown>) => window.parent.postMessage({ ...message, storeId }, location.origin);
  // The dashboard grows the frame to the gallery's height, so the page has one scroll and no empty band below.
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => post({ type: 'pagosya:resource-height', height: app.scrollHeight })).observe(app);
  app.innerHTML = '<p role="status">Cargando plantillas…</p>';
  try {
    const { revision } = await api.sourceState(storeId);
    const brief = revision ? (await api.sourceVersion(storeId, revision)).snapshot.brief : undefined;
    // Untouched: the current design is the one a template produced, so it can be replaced without the history note.
    const untouched = Boolean(brief?.templateId && brief.templateRevision === revision);
    await openTemplateGallery(api, { storeId, revision, hasSite: revision > 0 && !untouched, host: app,
      focus: open => { document.documentElement.classList.toggle('tpl-focus', open); if (open) window.scrollTo(0, 0); post({ type: 'pagosya:template-focus', open }); },
      applied: async saved => { post({ type: 'pagosya:template-applied', revision: saved }); } });
  } catch (error) {
    app.innerHTML = `<p role="alert">${error instanceof Error ? error.message.replace(/[<>&]/g, '') : 'No se pudieron cargar las plantillas.'}</p>`;
  }
}
