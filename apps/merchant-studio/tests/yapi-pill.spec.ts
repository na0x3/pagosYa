import { finishedChatJob } from './source-chat-job-fixture';
import { test, expect, type Page } from '@playwright/test';

/** YAPI in design mode (spec 2026-10-22 v2): the store full screen, YAPI as a movable pill that says what it is doing. */
async function openStudio(page: Page, layout: 'pill' | 'classic', opts: { gate?: Promise<void> } = {}) {
  const now = Date.now();
  let submitted = false;
  const progress = (status = 'running') => ({ status, startedAt: now, updatedAt: Date.now(), steps: [
    { stage: 'interpreting', label: 'Interpretando tu pedido', startedAt: now, status: 'completed' },
    { stage: 'building', label: 'Construyendo los cambios', startedAt: now, status, details: [{ label: 'Voy a: poner una sección por marca' }, { label: 'Leyó components/store-data.tsx' }] },
  ] });
  const version = { revision: 1, label: 'Tienda', snapshot: { schemaVersion: 1, brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Fotos' }, files: [
    { path: 'index.html', content: '<html><head><title>Tienda</title></head><body><h1>Tienda</h1><script src="config.js"></script><script src="commerce.js"></script></body></html>' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG={"data":{"items":[]}};' }, { path: 'commerce.js', content: '' },
  ] } };
  const earlier = [
    { id: 'u0', role: 'USER', content: 'Hazla más clara', metadata: {} },
    { id: 'a0', role: 'ASSISTANT', content: 'Listo: aclaré los colores.', metadata: { sourceRevision: 1, suggestions: [{ id: 's1', title: 'Únete a la comunidad', instruction: 'Agrega un registro', kind: 'design' }], progress: { status: 'completed', startedAt: now, updatedAt: now, steps: [{ stage: 'building', label: 'Construyendo los cambios', startedAt: now, status: 'completed', details: [{ label: 'Leyó components/home.tsx' }] }] } } },
  ];
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let body: any = {};
    if (path.endsWith('/stores')) body = [{ id: 's1', name: 'Tienda', slug: 'tienda' }];
    else if (path.endsWith('/conversation')) body = { messages: earlier };
    else if (path.endsWith('/catalog')) body = { items: [] };
    else if (/\/versions\/\d+$/.test(path)) body = version;
    else if (path.endsWith('/source-project')) body = { revision: 1, versions: [version] };
    else if (path.endsWith('/estimate')) body = { estimate: { minCredits: 1, maxCredits: 3 } };
    else if (path.endsWith('/progress')) body = { progress: submitted ? progress() : null };
    else if (path.endsWith('/chat-jobs') && route.request().method() === 'POST') {
      submitted = true;
      await opts.gate;
      body = { userMessage: { id: 'u1', role: 'USER', content: 'Pon una sección por marca' }, assistantMessage: { id: 'a1', role: 'ASSISTANT', content: 'Listo: puse una sección por marca.', metadata: { progress: progress('completed') } } };
    }
    await route.fulfill({ json: finishedChatJob(body) });
  });
  await page.goto(`/?source=1&layout=${layout}`);
}

test('design mode: store full width, the pill, plain words, the spinning star', async ({ page }) => {
  let release!: () => void;
  await openStudio(page, 'pill', { gate: new Promise<void>(resolve => { release = resolve; }) });
  await expect(page.locator('[data-yapi-pill]')).toBeVisible();
  await expect(page.locator('.agent-panel')).toHaveCount(0);
  await expect(page.locator('.yapi-exit')).toHaveAttribute('aria-label', 'Salir del diseño');
  const canvas = await page.locator('.source-canvas').boundingBox();
  expect(canvas!.width).toBeGreaterThan(page.viewportSize()!.width * 0.95);
  // Live check 2026-10-22: the fixed tools bar left the grid and the preview got a 150px row.
  const frame = await page.locator('.source-canvas .preview-frame').boundingBox();
  expect(frame!.height).toBeGreaterThan(page.viewportSize()!.height * 0.6);
  await expect(page.getByText('¿Cómo se navegará tu sitio?')).toHaveCount(0);
  await expect(page.getByText('Modelo', { exact: true })).toHaveCount(0);
  await page.locator('#agent-command').fill('Pon una sección por marca');
  await page.getByRole('button', { name: 'Enviar ↗' }).click();
  await expect(page.locator('.yapi-pill__star')).toHaveClass(/is-spin/);
  await expect(page.locator('.yapi-narrator')).toContainText('Estoy mirando cómo está hecha tu tienda', { timeout: 10_000 });
  await expect(page.locator('body')).not.toContainText('Leyó');
  release();
  await expect(page.locator('.yapi-pill__star')).not.toHaveClass(/is-spin/, { timeout: 10_000 });
});

test('the pill moves and stays where it was left', async ({ page }) => {
  await openStudio(page, 'pill');
  const pill = page.locator('[data-yapi-pill]');
  await expect(pill).toBeVisible();
  const before = (await pill.boundingBox())!;
  const star = (await page.locator('[data-yapi-star]').boundingBox())!;
  await page.mouse.move(star.x + star.width / 2, star.y + star.height / 2);
  await page.mouse.down();
  await page.mouse.move(star.x + 60, star.y - 200, { steps: 6 });
  await page.mouse.up();
  const after = (await pill.boundingBox())!;
  expect(after.y).toBeLessThan(before.y - 150);
  await page.reload();
  await expect(pill).toBeVisible();
  const reloaded = (await pill.boundingBox())!;
  expect(Math.abs(reloaded.y - after.y)).toBeLessThan(2);
});

test('Historial shows the conversation without the file log', async ({ page }) => {
  await openStudio(page, 'pill');
  await page.locator('[data-yapi-history-open]').click();
  const history = page.locator('.yapi-history');
  await expect(history).toBeVisible();
  await expect(history).toContainText('Listo: aclaré los colores.');
  await expect(history).not.toContainText('Leyó');
  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();
});

test('classic layout stays available', async ({ page }) => {
  await openStudio(page, 'classic');
  await expect(page.locator('.agent-panel')).toBeVisible();
  await expect(page.locator('[data-yapi-pill]')).toHaveCount(0);
});

test('cards waiting for an answer can be put away with their ×', async ({ page }) => {
  await openStudio(page, 'pill');
  const cards = page.locator('[data-yapi-cards]');
  await expect(cards).toContainText('Únete a la comunidad');
  await cards.getByRole('button', { name: 'Ocultar' }).click();
  await expect(cards).toHaveCount(0);
});
