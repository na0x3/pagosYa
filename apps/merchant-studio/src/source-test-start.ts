import { createPreviewImageLoader } from '@pagosya/storefront-preview';
import { API_BASE_URL, type MerchantStudioApi } from './api';
import { checkSourceWebsite, sourceCheckResult, sourceChecksBlockPublishing } from './source-checks';

type TestApi = Pick<MerchantStudioApi, 'sourceVersion' | 'recordSourceChecks' | 'startSourceTest'>;

/** A design test starts only after B passes the editor's desktop/mobile checks, recorded as the server asks (Remolino A/B 2026-10-22):
 *  photos inlined, because the check frame blocks the API's addresses. Shared by «Pruebas A/B» and YAPI's «Lanzar prueba». */
export async function checkAndStartTest(api: TestApi, storeId: string, revision: number, publicationVersion: number, request?: string) {
  const version = await api.sourceVersion(storeId, revision);
  const checks = await checkSourceWebsite(await createPreviewImageLoader(API_BASE_URL)(version.snapshot));
  await api.recordSourceChecks(storeId, revision, sourceCheckResult(checks));
  if (sourceChecksBlockPublishing(checks)) throw new Error('La versión B tiene comprobaciones pendientes en celular o computadora. Corrígela antes de iniciar la prueba.');
  return api.startSourceTest(storeId, revision, publicationVersion, request);
}
