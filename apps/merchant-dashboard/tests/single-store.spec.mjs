import { expect, test } from '@playwright/test';

async function account(page, { occupied = false } = {}) {
  const store = { id: 'only-store', name: 'Café Aroma', slug: 'cafe', status: 'ACTIVE', websiteRevision: 0, links: [], locations: [], animations: [], heroSlides: [], editorialGallery: [], contentOrder: ['hero', 'products'], checkoutMode: 'payment', cartRecommendationProductIds: [] };
  let stores = occupied ? [store] : [];
  const requests = [];
  await page.addInitScript(() => {
    sessionStorage.setItem('pagosya_merchant_session', 'multiple-store-test');
    sessionStorage.setItem('pagosya_merchant_email', 'single@example.test');
  });
  await page.route('http://localhost:3001/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname.slice(3), method = req.method();
    requests.push({ path, method });
    let body = [], status = 200;
    if (path === '/stores') {
      if (method === 'POST') {
        body = { ...store, id: `store-${stores.length + 1}`, name: req.postDataJSON().name };
        stores.push(body); status = 201;
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

test('an existing profile creates another store and switches independently', async ({ page }) => {
  const requests = await account(page, { occupied: true });
  await page.getByRole('button', { name: 'Crear una tienda Empieza desde cero', exact: true }).click();
  await page.getByLabel('Nombre de tu tienda').fill('Taller Norte');
  await page.getByRole('button', { name: 'Crear tienda', exact: true }).click();
  await expect(page.locator('#merchantStudioFrame')).toHaveAttribute('data-store-id', 'store-2');
  const editor = page.frameLocator('#merchantStudioFrame');
  await expect(editor.locator('[data-setup-prompt]')).toHaveText('¿Qué vendes?');
  await expect(editor.locator('.agent-panel')).toBeVisible();
  await editor.getByRole('button', { name: '← Mis tiendas', exact: true }).click();
  await expect(page.locator('.store-row')).toHaveCount(2);
  await expect(page.locator('#openCreateStore')).toBeVisible();
  await page.getByRole('combobox', { name: 'Tienda activa', exact: true }).selectOption('only-store');
  await expect(page.locator('.store-row.active')).toHaveAttribute('data-id', 'only-store');
  expect(requests.filter(req => req.path === '/stores' && req.method === 'POST')).toHaveLength(1);
});

test('store search and status filters retain the create tile, including on phones', async ({ page }) => {
  await account(page, { occupied: true });
  await page.getByRole('searchbox', { name: 'Buscar tiendas', exact: true }).fill('No coincide');
  await expect(page.locator('.store-row')).toHaveCount(0);
  await expect(page.locator('#openCreateStore')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar tiendas', exact: true }).fill('Café');
  await expect(page.locator('.store-row')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Estado de las tiendas', exact: true }).selectOption('published');
  await expect(page.locator('.store-row')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Estado de las tiendas', exact: true }).selectOption('draft');
  await expect(page.locator('.store-row')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#openCreateStore').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(await page.locator('.store-row').count()).toBe(1);
});
