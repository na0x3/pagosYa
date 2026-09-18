import { API_BASE_URL, MerchantStudioApi, SESSION_STORAGE_KEY } from './api';
import { sourcePreviewDocument } from './source-preview';
import { createPreviewImageLoader } from './source-preview-media';

/** A lazy, read-only saved-design thumbnail; no conversation, checks, or generation. */
export async function mountSourceThumbnail(app: HTMLDivElement): Promise<void> {
  document.documentElement.style.cssText = 'height:100%;overflow:hidden;background:#f8f8f2';
  document.body.style.cssText = 'margin:0;height:100%;overflow:hidden;background:#f8f8f2';
  app.style.cssText = 'width:100%;height:100%;overflow:hidden';
  const params = new URLSearchParams(location.search);
  const storeId = params.get('store') || '';
  const revision = Number(params.get('revision'));
  if (!storeId || !Number.isSafeInteger(revision) || revision < 1) return;
  app.textContent = 'Cargando diseño…';
  try {
    const api = new MerchantStudioApi(sessionStorage.getItem(SESSION_STORAGE_KEY) || '');
    const version = await api.sourceVersion(storeId, revision);
    const snapshot = await createPreviewImageLoader(API_BASE_URL)(version.snapshot);
    const frame = document.createElement('iframe');
    frame.title = 'Miniatura del diseño guardado';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.tabIndex = -1;
    frame.style.cssText = 'width:100%;height:100%;border:0;pointer-events:none';
    frame.srcdoc = sourcePreviewDocument(snapshot, 'index.html');
    app.replaceChildren(frame);
  } catch {
    app.textContent = 'No se pudo cargar la vista previa. Actualiza la lista para volver a intentar.';
  }
}
