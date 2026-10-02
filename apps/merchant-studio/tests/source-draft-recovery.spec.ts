import { expect, test } from '@playwright/test';

for (const firstSite of [false, true]) for (const width of [1440, 390]) test(`interrupted ${firstSite ? 'first-site' : 'existing-site'} draft survives failure and reload at ${width}px`, async ({ page }) => {
  const files = [
    { path: 'index.html', content: '<html><body><h1>Diseño guardado</h1></body></html>' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"items":[]}};' },
  ];
  const draftFiles = files.map(file => file.path === 'index.html' ? { ...file, content: '<html><body><h1>Borrador de mascotas</h1></body></html>' } : file);
  const version = { revision: 1, label: 'Guardado', snapshot: { schemaVersion: 1, brief: {}, files } };
  let submitted = false, failed = false;
  let releaseFailure!: () => void;
  const failureReady = new Promise<void>(resolve => { releaseFailure = resolve; });
  void failureReady.then(() => { failed = true; });
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(() => { if (window === window.top) sessionStorage.setItem('pagosya_merchant_session', 'test-session'); });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/chat-jobs') && route.request().method() === 'POST') {
      submitted = true;
      await route.fulfill({ json: { id: 'job1', requestId: 'request1', status: 'RUNNING' } });
      return;
    }
    if (path.endsWith('/chat-jobs/job1')) {
      await route.fulfill({ json: { id: 'job1', status: failed ? 'FAILED' : 'RUNNING', error: 'No se pudo completar la verificación.' } });
      return;
    }
    await route.fulfill({ json: path.endsWith('/stores') ? [{ id: 's1', name: 'Mascotas', slug: 'mascotas' }]
      : path.endsWith('/chat-jobs') ? { job: submitted && !failed ? { id: 'job1', requestId: 'request1', status: 'RUNNING' } : null }
      : path.endsWith('/conversation') ? { messages: failed ? [{ id: 'u1', role: 'USER', content: 'Adapta la tienda a mascotas', metadata: { assetUrls: [] } }, { id: 'a1', role: 'ASSISTANT', content: 'No se pudo completar la verificación.', metadata: { failed: true } }] : [] }
      : path.endsWith('/draft-preview') ? submitted ? { at: failed ? 20 : 10, interrupted: failed, files: draftFiles } : { at: null }
      : path.endsWith('/progress') ? { progress: null }
      : path.endsWith('/estimate') ? { billingMode: 'chatgpt-plan', model: 'gpt-5.6-sol', estimate: { minCredits: 1, maxCredits: 3 } }
      : path.endsWith('/catalog') ? { items: [], categories: [] }
      : path.endsWith('/versions/1') ? version
      : path.endsWith('/source-project') ? { revision: firstSite ? 0 : 1, versions: firstSite ? [] : [version], nextBefore: null }
      : {} });
  });
  await page.goto('/?source=1');
  await page.locator('[data-composer] textarea').fill('Adapta la tienda a mascotas');
  await page.locator('[data-composer] button[type="submit"]').click();
  const draft = () => page.frameLocator('iframe[title="Vista previa del borrador"]').getByRole('heading', { name: 'Borrador de mascotas' });
  await expect(draft()).toBeVisible();
  await page.reload();
  await expect(page.locator('.source-job-status')).toContainText('Tu pedido sigue guardado');
  await expect(draft()).toBeVisible();
  releaseFailure();
  await expect(page.locator('.source-draft-recovery')).toContainText('Tu borrador está conservado');
  await expect(draft()).toBeVisible();
  await expect(page.locator('#source-code-tab')).toBeDisabled();
  await expect(page.locator('#source-publish')).toBeDisabled();
  await expect(page.locator('#source-export')).toBeDisabled();
  await page.reload();
  await expect(draft()).toBeVisible();
  await expect(page.locator('.source-draft-recovery')).toBeVisible();
  const bannerBox = await page.locator('.source-draft-recovery').boundingBox();
  const frameBox = await page.locator('iframe[title="Vista previa del borrador"]').boundingBox();
  expect(bannerBox!.height).toBeLessThan(200);
  expect(frameBox!.height).toBeGreaterThan(300);

  if (!firstSite) {
  await page.getByRole('button', { name: 'Ver diseño guardado', exact: true }).click();
  await expect(page.frameLocator('iframe[title="Vista previa del sitio"]').getByRole('heading', { name: 'Diseño guardado' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver borrador conservado', exact: true }).click();
  await expect(draft()).toBeVisible();
  await expect(page.locator('#source-publish')).toBeDisabled();
  }
});
