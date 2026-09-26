import { MerchantStudioApi, SESSION_STORAGE_KEY } from './api';
import { openTemplateGallery } from './source-templates';

/** The dashboard's Plantillas tab: the gallery as a page for the store in the URL. Applying a template tells the
 * dashboard, which opens the design editor on the new revision. */
export async function mountTemplatesPage(app: HTMLElement) {
  const storeId = new URLSearchParams(location.search).get('store') || '';
  const api = new MerchantStudioApi(sessionStorage.getItem(SESSION_STORAGE_KEY) || '');
  app.innerHTML = '<p role="status">Cargando plantillas…</p>';
  try {
    const { revision } = await api.sourceState(storeId);
    const brief = revision ? (await api.sourceVersion(storeId, revision)).snapshot.brief : undefined;
    // Untouched: the current design is the one a template produced, so it can be replaced without the history note.
    const untouched = Boolean(brief?.templateId && brief.templateRevision === revision);
    await openTemplateGallery(api, { storeId, revision, hasSite: revision > 0 && !untouched, host: app,
      applied: async saved => { window.parent.postMessage({ type: 'pagosya:template-applied', storeId, revision: saved }, location.origin); } });
  } catch (error) {
    app.innerHTML = `<p role="alert">${error instanceof Error ? error.message.replace(/[<>&]/g, '') : 'No se pudieron cargar las plantillas.'}</p>`;
  }
}
