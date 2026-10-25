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

// Phones and tablets keep the movable pill; from 900px YAPI is a glass panel fixed at the left (owner 2026-10-23).
test.describe('phones and tablets: the movable pill', () => {
  test.use({ viewport: { width: 820, height: 900 } });
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
});

test.describe('desktop: YAPI fixed at the left in glass', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('the panel sits at the left, shows the conversation and leaves the whole store visible beside it', async ({ page }) => {
    await openStudio(page, 'pill');
    const dock = page.locator('.yapi-dock');
    await expect(dock).toBeVisible();
    const panel = (await dock.boundingBox())!;
    expect(panel.x).toBeLessThan(30);
    expect(panel.height).toBeGreaterThan(700);
    await expect(dock.locator('.yapi-history')).toContainText('Listo: aclaré los colores.');
    await expect(dock.locator('[data-yapi-pill]')).toBeVisible();
    // The open conversation already ends with the waiting message: no second copy in a card.
    await expect(dock.locator('.yapi-history')).toContainText('Únete a la comunidad');
    await expect(dock.locator('[data-yapi-cards]')).toBeHidden();
    const pill = (await dock.locator('[data-yapi-pill]').boundingBox())!;
    expect(pill.y + pill.height).toBeGreaterThan(panel.y + panel.height - 40);
    const canvas = (await page.locator('.source-canvas').boundingBox())!;
    expect(canvas.x).toBeGreaterThanOrEqual(panel.x + panel.width);
    expect(canvas.x + canvas.width).toBeGreaterThan(1240);
    const tools = (await page.locator('.canvas-toolbar').boundingBox())!;
    expect(tools.x).toBeGreaterThanOrEqual(panel.x + panel.width);
    // The top controls sit above the store, never on its header (live check 2026-10-23).
    expect(canvas.y).toBeGreaterThanOrEqual(tools.y + tools.height);
    const publish = (await page.locator('.source-publish-controls').boundingBox())!;
    expect(canvas.y).toBeGreaterThanOrEqual(publish.y + publish.height);
  });
  test('no «Tu pedido sigue guardado» bar over the store while YAPI works (owner 2026-10-23)', async ({ page }) => {
    let release!: () => void;
    await openStudio(page, 'pill', { gate: new Promise<void>(resolve => { release = resolve; }) });
    await page.locator('#agent-command').fill('Pon una sección por marca');
    await page.getByRole('button', { name: 'Enviar ↗' }).click();
    await expect(page.locator('.yapi-pill__star')).toHaveClass(/is-spin/);
    await expect(page.locator('.source-job-status')).toHaveCount(0);
    await expect(page.getByText('Tu pedido sigue guardado')).toHaveCount(0);
    release();
  });
  test('YAPI\'s words sit inside the panel, never as a window over it (owner 2026-10-23)', async ({ page }) => {
    let release!: () => void;
    await openStudio(page, 'pill', { gate: new Promise<void>(resolve => { release = resolve; }) });
    await page.locator('#agent-command').fill('Pon una sección por marca');
    await page.getByRole('button', { name: 'Enviar ↗' }).click();
    const narrator = page.locator('.yapi-dock .yapi-narrator');
    await expect(narrator).toContainText('Estoy mirando', { timeout: 10_000 });
    expect(await narrator.evaluate(el => getComputedStyle(el).position)).toBe('static');
    const dock = (await page.locator('.yapi-dock').boundingBox())!;
    const box = (await narrator.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(dock.x);
    expect(box.x + box.width).toBeLessThanOrEqual(dock.x + dock.width + 1);
    const pill = (await page.locator('[data-yapi-pill]').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(pill.y + 1);
    await expect(page.locator('.yapi-narrator-pill')).toBeHidden();
    release();
  });
  test('the panel is see-through glass', async ({ page }) => {
    await openStudio(page, 'pill');
    const dock = page.locator('.yapi-dock');
    await expect.poll(() => dock.evaluate(el => getComputedStyle(el).getPropertyValue('backdrop-filter'))).toContain('blur');
    const bg = await dock.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(Number(/rgba?\([^)]*,\s*([\d.]+)\)/.exec(bg)?.[1] ?? 1)).toBeLessThan(0.4);
  });
  test('the panel stays put: dragging the star does not move it', async ({ page }) => {
    await openStudio(page, 'pill');
    const place = () => page.locator('[data-yapi-pill]').evaluate(el => { const r = el.getBoundingClientRect(); return Math.round(r.x) + ',' + Math.round(r.y); });
    await expect(page.locator('.yapi-dock [data-yapi-pill]')).toBeVisible();
    const before = await place();
    const star = (await page.locator('[data-yapi-star]').boundingBox())!;
    await page.mouse.move(star.x + star.width / 2, star.y + star.height / 2);
    await page.mouse.down();
    await page.mouse.move(star.x + 300, star.y - 300, { steps: 6 });
    await page.mouse.up();
    expect(await place()).toBe(before);
  });
  test('full screen: the panel tucks away, the store fills the screen under the top controls, and YAPI comes back', async ({ page }) => {
    await openStudio(page, 'pill');
    const dock = page.locator('.yapi-dock');
    await expect(dock).toBeVisible();
    await page.getByRole('button', { name: 'Ver la tienda en pantalla completa' }).click();
    await expect(dock).toBeHidden();
    await expect.poll(async () => (await page.locator('.source-canvas').boundingBox())?.width ?? 0).toBeGreaterThan(1250);
    await expect(page.locator('.canvas-toolbar')).toBeVisible();
    await expect(page.locator('.yapi-exit')).toBeVisible();
    const top = (await page.locator('.canvas-toolbar').boundingBox())!;
    expect((await page.locator('.source-canvas').boundingBox())!.y).toBeGreaterThanOrEqual(top.y + top.height);
    await expect(page.locator('.source-publish-controls')).toBeVisible();
    const open = page.getByRole('button', { name: 'Mostrar a YAPI' });
    await expect(open).toBeVisible();
    expect((await open.boundingBox())!.y).toBeLessThan(60);
    await page.reload();
    await expect(open).toBeVisible();
    await expect(dock).toBeHidden();
    await open.click();
    await expect(dock).toBeVisible();
    await expect(open).toBeHidden();
    await expect(page.locator('#agent-command')).toBeFocused();
  });
});

test('classic layout stays available', async ({ page }) => {
  await openStudio(page, 'classic');
  await expect(page.locator('.agent-panel')).toBeVisible();
  await expect(page.locator('[data-yapi-pill]')).toHaveCount(0);
});

test.describe('phones and tablets: the waiting card', () => {
  test.use({ viewport: { width: 820, height: 900 } });
  test('cards waiting for an answer can be put away with their ×', async ({ page }) => {
    await openStudio(page, 'pill');
    const cards = page.locator('[data-yapi-cards]');
    await expect(cards).toContainText('Únete a la comunidad');
    await cards.getByRole('button', { name: 'Ocultar' }).click();
    await expect(cards).toHaveCount(0);
  });
});

test('review: «Crear producto» opens the form above the pill and closing it gives the pill back', async ({ page }) => {
  await openStudio(page, 'pill');
  await page.locator('[data-yapi-plus]').click();
  await page.getByRole('menuitem', { name: 'Crear producto' }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible();
  await expect(page.locator('.yapi-pill__menu')).toBeHidden();
  await page.getByRole('button', { name: 'Cancelar creación de producto' }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo producto' })).toHaveCount(0);
  await expect(page.locator('#agent-command')).toBeEnabled();
});

test('review: what the merchant typed survives a re-render', async ({ page }) => {
  await openStudio(page, 'pill');
  await page.locator('#agent-command').fill('Pon una sección por marca');
  await page.locator('[data-yapi-plus]').click();
  await expect(page.locator('#agent-command')).toHaveValue('Pon una sección por marca');
});

test('review: YAPI\'s bubble grows upward and never covers the pill', async ({ page }) => {
  let release!: () => void;
  await openStudio(page, 'pill', { gate: new Promise<void>(resolve => { release = resolve; }) });
  await page.locator('#agent-command').fill('Pon una sección por marca');
  await page.getByRole('button', { name: 'Enviar ↗' }).click();
  await expect(page.locator('.yapi-narrator')).toContainText('Estoy mirando', { timeout: 10_000 });
  const bubble = (await page.locator('.yapi-narrator').boundingBox())!;
  const pill = (await page.locator('[data-yapi-pill]').boundingBox())!;
  expect(bubble.y + bubble.height).toBeLessThanOrEqual(pill.y + 1);
  release();
});

test('review: selecting a section shows its chip in the pill at once', async ({ page }) => {
  await openStudio(page, 'pill');
  await page.locator('.canvas-toolbar').getByRole('button', { name: 'Seleccionar', exact: true }).click();
  await page.frameLocator('.source-canvas iframe').locator('body').evaluate(() => parent.postMessage({ type: 'pagosya:source-select', kind: 'section', sectionId: 'marcas', label: 'Sección de marcas' }, '*'));
  await expect(page.locator('.yapi-pill__chip')).toContainText('Sobre: Sección de marcas');
});

test('review: Publicar sits alone at the top right and does not fade', async ({ page }) => {
  await openStudio(page, 'pill');
  const publish = page.locator('.source-publish-controls');
  await expect(publish).toBeVisible();
  expect(await publish.evaluate(el => Boolean(el.closest('.canvas-toolbar')))).toBe(false);
  const box = (await publish.boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan(page.viewportSize()!.width - 40);
  expect(box.y).toBeLessThan(40);
});

