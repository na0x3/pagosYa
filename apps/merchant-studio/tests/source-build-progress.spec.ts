import { test, expect } from '@playwright/test';

test('chat displays server milestones live and keeps the completed process with the reply', async ({ page }) => {
  let stage = 'building', requestId = '', submitted = false;
  let release!: () => void;
  const responseGate = new Promise<void>(resolve => { release = resolve; });
  const now = Date.now();
  const progress = (status = 'running') => ({ status, startedAt: now, updatedAt: Date.now(), steps: [
    { stage: 'interpreting', label: 'Interpretando tu pedido', startedAt: now, status: 'completed' },
    { stage, label: stage === 'building' ? 'Construyendo los cambios' : 'Comprobando el código y los recursos', startedAt: now, status },
  ] });
  const version = { revision: 1, label: 'Tienda', snapshot: { schemaVersion: 1, brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Fotos' }, files: [
    { path: 'index.html', content: '<html><head><title>Tienda</title></head><body><h1>Tienda</h1><script src="config.js"></script><script src="commerce.js"></script></body></html>' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG={"data":{"items":[]}};' }, { path: 'commerce.js', content: '' },
  ] } };
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let body: any = {};
    if (path.endsWith('/stores')) body = [{ id: 's1', name: 'Tienda', slug: 'tienda' }];
    else if (path.endsWith('/conversation')) body = { messages: [] };
    else if (path.endsWith('/catalog')) body = { items: [] };
    else if (/\/versions\/\d+$/.test(path)) body = version;
    else if (path.endsWith('/source-project')) body = { revision: 1, versions: [version] };
    else if (path.endsWith('/estimate')) body = { estimate: { minCredits: 1, maxCredits: 3 } };
    else if (path.endsWith('/progress')) { expect(url.searchParams.get('requestId')).toBe(requestId); body = { progress: submitted ? progress() : null }; }
    else if (path.endsWith('/messages')) {
      requestId = route.request().postDataJSON().requestId;
      expect(requestId).toMatch(/^[a-f0-9-]{36}$/); submitted = true;
      await responseGate;
      body = { userMessage: { id: 'u1', role: 'USER', content: 'Mejora el título' }, assistantMessage: { id: 'a1', role: 'ASSISTANT', content: 'El título está listo.', metadata: { progress: progress('completed') } } };
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/?source=1');
  await page.getByRole('textbox', { name: 'Indicación para YAPI' }).fill('Mejora el título');
  await page.getByRole('button', { name: 'Enviar a YAPI' }).click();
  const live = page.locator('[data-build-progress]');
  await expect(live).toContainText('Construyendo los cambios');
  await expect(live).not.toContainText('Comprobando el código');
  await live.locator('summary').click();
  stage = 'validating';
  await expect(live).toContainText('Comprobando el código y los recursos');
  await expect(live.locator('details')).not.toHaveAttribute('open');
  await live.locator('summary').click();
  await page.screenshot({ path: '/private/tmp/source-build-progress-live.png' });
  release();
  await expect(page.getByText('El título está listo.', { exact: true })).toBeVisible();
  await expect(live).toHaveCount(0);
  const saved = page.locator('.source-build-progress');
  await expect(saved.locator('summary')).toContainText('Trabajo completado');
  await expect(saved).not.toHaveAttribute('open');
  await saved.locator('summary').click();
  await expect(saved).toContainText('Comprobando el código y los recursos');
  await expect(page.getByRole('button', { name: 'Enviar a YAPI' })).toBeEnabled();
});
