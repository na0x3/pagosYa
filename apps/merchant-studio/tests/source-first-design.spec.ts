import { expect, test, type Page } from '@playwright/test';

// Spec 2026-10-28 §1: a new store's template build (rev 1) is followed by its first design; the Studio covers the canvas
// with «YAPI está diseñando tu tienda» until that design lands, and shows rev 1 only when the design finally fails.
const files = (heading: string) => [
  { path: 'index.html', content: `<html><body><h1>${heading}</h1></body></html>` },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"items":[]}};' },
];
const v1 = { revision: 1, label: 'Plantilla', snapshot: { schemaVersion: 1, brief: {}, files: files('Plantilla') } };
const v2 = { revision: 2, label: 'Diseño', snapshot: { schemaVersion: 1, brief: {}, files: files('Diseño final') } };
const site = (page: Page) => page.frameLocator('iframe[title="Vista previa del sitio"]');

async function mockStore(page: Page, state: { designStatus: string; submitted?: boolean; noSiteYet?: boolean; buildStatus?: string; latest?: () => unknown }) {
  // Records whether the template ever reached the canvas while the first design was pending.
  await page.addInitScript(() => {
    if (window !== window.top) return;
    sessionStorage.setItem('pagosya_merchant_session', 'test-session');
    new MutationObserver(() => { if (document.querySelector('iframe[title="Vista previa del sitio"]') && !(window as any).__designDone) (window as any).__sawTemplate = true; })
      .observe(document, { childList: true, subtree: true });
  });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const designJob = () => ({ id: 'job2', requestId: 'r2', status: state.designStatus, sequence: 2, firstDesign: true, ...(state.designStatus === 'FAILED' ? { error: 'No se pudo terminar el diseño.' } : {}),
      ...(state.designStatus === 'COMPLETED' ? { result: { userMessage: { id: 'u2', role: 'USER', content: 'Diseño' }, assistantMessage: { id: 'a2', role: 'ASSISTANT', content: 'Tu diseño está listo.' }, revision: { revision: 2 } } } : {}) });
    const done = state.designStatus === 'COMPLETED';
    if (path.endsWith('/chat-jobs') && route.request().method() === 'POST') {
      state.submitted = true; state.noSiteYet = false;
      await route.fulfill({ json: { id: 'job1', requestId: 'r1', status: 'COMPLETED', sequence: 1, designNext: true, result: {
        userMessage: { id: 'u1', role: 'USER', content: 'Crea mi tienda' }, assistantMessage: { id: 'a1', role: 'ASSISTANT', content: 'Tu tienda está lista.' }, revision: { revision: 1 } } } });
      return;
    }
    if (path.endsWith('/chat-jobs/job2')) { await route.fulfill({ json: designJob() }); return; }
    // The template build itself, followed after a reload (review fix I5).
    if (path.endsWith('/chat-jobs/job1')) { await route.fulfill({ json: { id: 'job1', requestId: 'r1', status: state.buildStatus, sequence: 1, ...(state.buildStatus === 'COMPLETED' ? { designNext: true, result: { userMessage: { id: 'u1', role: 'USER', content: 'Crea mi tienda' }, assistantMessage: { id: 'a1', role: 'ASSISTANT', content: 'Tu tienda está lista.' }, revision: { revision: 1 } } } : {}) } }); return; }
    if (path.endsWith('/chat-jobs/job3')) { await route.fulfill({ json: { id: 'job3', requestId: 'r3', status: 'RUNNING', sequence: 1 } }); return; }
    await route.fulfill({ json: path.endsWith('/stores') ? [{ id: 's1', name: 'Dulce', slug: 'dulce' }]
      : path.endsWith('/chat-jobs') ? { job: state.latest ? state.latest() : state.noSiteYet ? null : designJob() }
      : path.endsWith('/conversation') ? { messages: [] }
      : path.endsWith('/draft-preview') ? { at: null }
      : path.endsWith('/progress') ? { progress: null }
      : path.endsWith('/estimate') ? { billingMode: 'chatgpt-plan', model: 'gpt-5.6-sol', estimate: { minCredits: 1, maxCredits: 3 } }
      : path.endsWith('/catalog') ? { items: [], categories: [] }
      : path.endsWith('/versions/1') ? v1
      : path.endsWith('/versions/2') ? v2
      : path.endsWith('/source-project') ? state.noSiteYet ? { revision: 0, versions: [], nextBefore: null } : { revision: done ? 2 : 1, versions: done ? [v2, v1] : [v1], nextBefore: null }
      : {} });
  });
}

test('a new store opens on its finished design, never on the template', async ({ page }) => {
  const state = { designStatus: 'RUNNING', noSiteYet: true };
  await mockStore(page, state);
  await page.goto('/?source=1');
  await page.locator('[data-composer] textarea').fill('Crea mi tienda');
  await page.locator('[data-composer] button[type="submit"]').click();
  await expect(page.locator('.source-designing')).toContainText('YAPI está diseñando tu tienda');
  await expect(page.locator('iframe[title="Vista previa del sitio"]')).toHaveCount(0);
  await page.evaluate(() => { (window as any).__designDone = true; });
  state.designStatus = 'COMPLETED';
  await expect(site(page).getByRole('heading', { name: 'Diseño final' })).toBeVisible();
  await expect(page.locator('.source-designing')).toHaveCount(0);
  expect(await page.evaluate(() => Boolean((window as any).__sawTemplate))).toBe(false);
});

test('coming back while the first design runs keeps the cover, and a quota wait says so', async ({ page }) => {
  const state = { designStatus: 'RUNNING' };
  await mockStore(page, state);
  await page.goto('/?source=1');
  await expect(page.locator('.source-designing')).toContainText('YAPI está diseñando tu tienda');
  await expect(page.locator('iframe[title="Vista previa del sitio"]')).toHaveCount(0);
  state.designStatus = 'QUEUED';
  await expect(page.locator('.source-designing')).toContainText('YAPI sigue diseñando; termina en un rato.');
  await page.evaluate(() => { (window as any).__designDone = true; });
  state.designStatus = 'COMPLETED';
  await expect(site(page).getByRole('heading', { name: 'Diseño final' })).toBeVisible();
  expect(await page.evaluate(() => Boolean((window as any).__sawTemplate))).toBe(false);
});

test('a first design that finally fails shows the template', async ({ page }) => {
  const state = { designStatus: 'RUNNING' };
  await mockStore(page, state);
  await page.goto('/?source=1');
  await expect(page.locator('.source-designing')).toContainText('YAPI está diseñando tu tienda');
  state.designStatus = 'FAILED';
  await expect(site(page).getByRole('heading', { name: 'Plantilla' })).toBeVisible();
  await expect(page.locator('.source-designing')).toHaveCount(0);
});

test('coming back during the template build keeps the cover and follows on to the design', async ({ page }) => {
  const state: any = { designStatus: 'QUEUED', buildStatus: 'RUNNING', noSiteYet: true };
  state.latest = () => state.buildStatus === 'RUNNING' ? { id: 'job1', requestId: 'r1', status: 'RUNNING', sequence: 1 } : { id: 'job2', requestId: 'r2', status: state.designStatus, sequence: 2, firstDesign: true };
  await mockStore(page, state);
  await page.goto('/?source=1');
  await page.waitForTimeout(1500);
  state.buildStatus = 'COMPLETED'; state.noSiteYet = false; state.designStatus = 'RUNNING';
  await expect(page.locator('.source-designing')).toContainText('YAPI está diseñando tu tienda');
  await page.evaluate(() => { (window as any).__designDone = true; });
  state.designStatus = 'COMPLETED';
  await expect(site(page).getByRole('heading', { name: 'Diseño final' })).toBeVisible();
  expect(await page.evaluate(() => Boolean((window as any).__sawTemplate))).toBe(false);
});

test('a request that is not the first design takes the cover away', async ({ page }) => {
  const state: any = { designStatus: 'RUNNING', noSiteYet: true };
  state.latest = () => state.noSiteYet ? null : { id: 'job3', requestId: 'r3', status: 'RUNNING', sequence: 1 };
  await mockStore(page, state);
  await page.goto('/?source=1');
  await page.locator('[data-composer] textarea').fill('Crea mi tienda');
  await page.locator('[data-composer] button[type="submit"]').click();
  await expect(site(page).getByRole('heading', { name: 'Plantilla' })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.source-designing')).toHaveCount(0);
});
