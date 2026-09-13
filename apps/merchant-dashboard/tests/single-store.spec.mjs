import { expect, test } from '@playwright/test';

async function account(page, { occupied = false, conflict = false } = {}) {
  const store = { id: 'only-store', name: 'Café Aroma', slug: 'cafe', status: 'ACTIVE', websiteRevision: 0, links: [], locations: [], animations: [], heroSlides: [], editorialGallery: [], contentOrder: ['hero', 'products'], checkoutMode: 'payment', cartRecommendationProductIds: [] };
  let stores = occupied ? [store] : [];
  const requests = [];
  await page.addInitScript(() => {
    sessionStorage.setItem('pagosya_merchant_session', 'single-store-test');
    sessionStorage.setItem('pagosya_merchant_email', 'single@example.test');
  });
  await page.route('http://localhost:3001/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname.slice(3), method = req.method();
    requests.push({ path, method });
    let body = [], status = 200;
    if (path === '/stores') {
      if (method === 'POST') {
        stores = [store];
        body = conflict ? { message: 'Tu cuenta ya tiene una tienda. Administra la tienda existente.' } : store;
        status = conflict ? 409 : 201;
      } else body = stores;
    } else if (path === '/stores/only-store' && method === 'DELETE') { stores = []; body = { success: true }; }
    else if (path.endsWith('/source-project')) body = { revision: 0, versions: [], nextBefore: null };
    else if (path.endsWith('/conversation')) body = { messages: [], setup: { step: 'business', prompt: '¿Qué vendes?', options: [] } };
    else if (path.endsWith('/catalog')) body = { storeName: store.name, items: [], categories: [] };
    else if (path.endsWith('/visual-studio')) body = { proposals: [], versions: [] };
    else if (path === '/merchants/balance') body = { payableBalance: 0 };
    else if (path === '/merchants/kyc') body = { status: 'APPROVED' };
    else if (path === '/merchants/invoicing_profile') body = { status: 'NOT_CONFIGURED' };
    else if (path === '/merchants/finances') body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: 'BOB' };
    else if (path === '/auth/google') body = { enabled: false };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/#dashboard-stores');
  await expect(page.locator('#storeRows')).toContainText(occupied ? store.name : 'Todavía no tienes una tienda');
  return requests;
}

test('empty account creates one store and hides creation; deleting it allows a replacement', async ({ page }) => {
  const requests = await account(page);
  await expect(page.locator('#createStoreForm')).toBeVisible();
  await page.getByLabel('Nombre de tu tienda').fill('Café Aroma');
  await page.getByRole('button', { name: 'Crear tienda', exact: true }).click();
  await expect(page.locator('#createStoreForm')).toBeHidden();
  await expect(page.locator('#merchantStudioFrame')).toHaveAttribute('data-store-id', 'only-store');
  const editor = page.frameLocator('#merchantStudioFrame');
  await expect(editor.locator('[data-setup-prompt]')).toHaveText('¿Qué vendes?');
  await expect(editor.locator('#source-store')).toHaveCount(0);
  await page.locator('#storeFullscreenNavHandle').click();
  await page.locator('#dashboardNav [data-dashboard-view="stores"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-dashboard-view', 'stores');
  await expect(page.locator('.store-row-name')).toBeVisible();
  await expect(page.locator('#createStoreForm')).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.test-artifacts/single-store-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#createStoreForm')).toBeHidden();
  await page.screenshot({ path: '.test-artifacts/single-store-mobile.png', animations: 'disabled' });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.delete-store').click();
  await expect(page.locator('#createStoreForm')).toBeVisible();
  expect(requests.filter(req => req.path === '/stores' && req.method === 'POST')).toHaveLength(1);
});

test('an existing account cannot submit the hidden creation form', async ({ page }) => {
  const requests = await account(page, { occupied: true });
  await expect(page.locator('#createStoreForm')).toBeHidden();
  await page.locator('#createStoreForm').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(requests.filter(req => req.path === '/stores' && req.method === 'POST')).toHaveLength(0);
});

test('creation in another session refreshes the existing store after a conflict', async ({ page }) => {
  await account(page, { conflict: true });
  await page.getByLabel('Nombre de tu tienda').fill('Otra tienda');
  await page.getByRole('button', { name: 'Crear tienda', exact: true }).click();
  await expect(page.locator('#storeRows')).toContainText('Café Aroma');
  await expect(page.locator('#createStoreForm')).toBeHidden();
  await expect(page.locator('#error')).toContainText('Tu cuenta ya tiene una tienda');
});
