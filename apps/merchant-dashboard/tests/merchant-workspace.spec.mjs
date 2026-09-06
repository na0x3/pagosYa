import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function workspace(page, withSite = false) {
  const version = { revision: 1, label: 'Sitio guardado', snapshot: { schemaVersion: 1, brief: {}, files: [
    { path: 'index.html', content: '<h1>Mi café</h1><div data-pagosya-catalog></div><div data-pagosya-cart></div><p data-pagosya-status></p><script src="config.js"></script><script src="commerce.js"></script>' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"items":[],"categories":[]}};' },
    { path: 'commerce.js', content: readFileSync(new URL('../../api/src/stores/source-kit/commerce.js', import.meta.url), 'utf8') },
  ] } };
  const stores = ['Café Aroma', 'Taller Norte'].map((name, i) => ({ id: `store_${i + 1}`, merchantId: 'm1', slug: `tienda-${i + 1}`, name, status: 'ACTIVE', websiteRevision: 0, heroSlides: [], contentOrder: ['hero', 'products'], editorialGallery: [], links: [], locations: [], animations: [], checkoutMode: 'payment', cartRecommendationProductIds: [] }));
  const products = [], requests = [], conversations = new Map();
  const steps = ['business', 'logo', 'products', 'colors', 'review'];
  const prompt = step => ({ business: '¿Qué vendes y a quién?', logo: '¿Tienes un logo?', products: '¿Qué productos quieres destacar?', colors: '¿Qué colores representan tu marca?', review: '¿Creamos la primera versión?' })[step];
  const setup = step => ({ step, prompt: prompt(step), options: step === 'review' ? [{ label: 'Crear mi sitio', value: 'Crear mi sitio', action: 'generate' }] : [] });
  await page.addInitScript(() => { sessionStorage.setItem('pagosya_merchant_session', 'workspace-test'); sessionStorage.setItem('pagosya_merchant_email', 'merchant@example.com'); });
  await page.route('http://localhost:3001/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.slice(3), method = request.method();
    requests.push({ path, method, body: request.postData() ? request.postDataJSON() : null });
    let body = [];
    const storeId = path.split('/')[2];
    if (!conversations.has(storeId)) conversations.set(storeId, { messages: [], step: 'business' });
    const conversation = conversations.get(storeId);
    if (path === '/stores') body = stores;
    else if (path.endsWith('/source-project')) body = { revision: withSite ? 1 : 0, versions: withSite ? [version] : [], nextBefore: null };
    else if (path.endsWith('/versions/1')) body = version;
    else if (path.endsWith('/conversation')) body = { messages: conversation.messages, setup: withSite ? null : setup(conversation.step) };
    else if (path.endsWith('/source-project/catalog')) body = { storeName: stores.find(s => s.id === storeId)?.name, items: products, categories: [] };
    else if (path.endsWith('/source-project/messages')) {
      const input = request.postDataJSON();
      expect(input.setupStep).toBe(conversation.step);
      conversation.step = steps[Math.min(4, steps.indexOf(conversation.step) + 1)];
      const userMessage = { id: `u${conversation.messages.length}`, role: 'USER', content: input.instruction };
      const assistantMessage = { id: `a${conversation.messages.length}`, role: 'ASSISTANT', content: prompt(conversation.step), metadata: { sourceSetup: {} } };
      conversation.messages.push(userMessage, assistantMessage);
      body = { userMessage, assistantMessage, setup: withSite ? null : setup(conversation.step) };
    } else if (path.endsWith('/payment_links')) {
      if (method === 'POST') { const input = request.postDataJSON(); const product = { ...input, id: 'p1', status: 'ACTIVE', imageUrls: [], createdAt: new Date().toISOString() }; products.push(product); body = product; } else body = products;
    } else if (path.endsWith('/visual-studio')) body = { proposals: [], versions: [] };
    else if (path === '/merchants/balance') body = { payableBalance: 0 };
    else if (path === '/merchants/kyc') body = { status: 'APPROVED' };
    else if (path === '/merchants/invoicing_profile') body = { status: 'NOT_CONFIGURED' };
    else if (path === '/merchants/finances') body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: 'BOB' };
    else if (path === '/auth/google') body = { enabled: false };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/#dashboard-stores');
  await page.locator('.store-row[data-id="store_1"] .store-row-name').click();
  const editor = page.frameLocator('#merchantStudioFrame');
  if (withSite) await expect(editor.frameLocator('iframe').getByRole('heading', { name: 'Mi café' })).toBeVisible();
  else await expect(editor.locator('[data-setup-prompt]')).toHaveText(prompt('business'));
  return { editor, products, requests };
}

test('store opens the shared editor; setup and an unsent message survive product management and reload', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const { editor, products, requests } = await workspace(page);
  await expect(page.locator('body')).toHaveAttribute('data-dashboard-view', 'workspace');
  await expect(page.locator('#onboardingDialog')).not.toBeVisible();
  await expect(page.locator('#merchantStoreTabs')).not.toBeVisible();
  await expect(page.locator('#storeFullscreenNavHandle')).toBeVisible();
  const bounds = await page.locator('#merchantStudioFrame').boundingBox();
  expect(bounds).toEqual({ x: 0, y: 0, ...page.viewportSize() });
  await expect(editor.locator('#source-store')).not.toBeVisible();
  const composer = editor.getByRole('textbox', { name: 'Indicación para YAPI' });
  await composer.fill('Café de especialidad para el barrio'); await editor.getByRole('button', { name: 'Enviar a YAPI' }).click();
  await expect(editor.locator('[data-setup-prompt]')).toContainText('logo');
  await page.reload(); await expect(editor.locator('[data-setup-prompt]')).toContainText('logo');
  await composer.fill('Usar solo mi nombre'); await editor.getByRole('button', { name: 'Enviar a YAPI' }).click();
  await expect(editor.locator('[data-setup-prompt]')).toContainText('productos');
  await composer.fill('Destacar el café en grano');
  await editor.getByRole('button', { name: 'Administrar productos' }).click();

  await expect(page.locator('#paymentLinksSection')).toBeVisible();
  await page.locator('#paymentLinkName').fill('Café en grano'); await page.locator('#paymentLinkAmount').fill('65');
  await page.locator('#paymentLinkSubmit').click();
  await expect.poll(() => products.length).toBe(1);
  expect(products[0].amount).toBe(6500);
  expect(requests.find(r => r.method === 'POST' && r.path.endsWith('/payment_links')).path).toBe('/stores/store_1/payment_links');
  await page.locator('#merchantStoreTabs [data-dashboard-view="workspace"]').click();
  await expect(composer).toHaveValue('Destacar el café en grano');
  await editor.getByRole('button', { name: 'Enviar a YAPI' }).click();
  await expect(editor.locator('[data-setup-prompt]')).toContainText('colores');
  await composer.fill('Verde bosque y crema'); await editor.getByRole('button', { name: 'Enviar a YAPI' }).click();
  await expect(editor.getByRole('button', { name: 'Crear mi sitio', exact: true })).toBeVisible();
  expect(requests.filter(r => r.path.endsWith('/messages')).every(r => !r.body.setupAction)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.test-artifacts/merchant-workspace-desktop.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#merchantStudioFrame').scrollIntoViewIfNeeded();
  await expect(composer).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.test-artifacts/merchant-workspace-mobile.png', fullPage: false });
  expect(errors).toEqual([]);
});

test('switching stores protects unsent work and scopes the editor; untrusted messages cannot navigate', async ({ page }) => {
  const { editor } = await workspace(page);
  const composer = editor.getByRole('textbox', { name: 'Indicación para YAPI' });
  await composer.fill('Un mensaje sin enviar');
  await page.locator('#storeFullscreenNavHandle').click();
  await page.locator('#dashboardNav [data-dashboard-view="stores"]').click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('.store-row[data-id="store_2"] .store-row-name').click();
  await expect(page.locator('#merchantStudioFrame')).toHaveAttribute('data-store-id', 'store_1');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.store-row[data-id="store_2"] .store-row-name').click();
  await expect(page.locator('#merchantStudioFrame')).toHaveAttribute('data-store-id', 'store_2');
  await expect(composer).toHaveValue('');
  await expect(page.locator('#merchantWorkspaceStoreName')).toHaveText('Taller Norte');
  await page.evaluate(() => window.postMessage({ type: 'pagosya:workspace', view: 'products' }, location.origin));
  await expect(page.locator('body')).toHaveAttribute('data-dashboard-view', 'workspace');
});


test('saved site previews refresh the real catalog after product creation without a new source revision', async ({ page }) => {
  const { editor, products, requests } = await workspace(page, true);
  await page.locator('#storeFullscreenNavHandle').click();
  await page.locator('#dashboardNav [data-dashboard-view="products"]').click();
  await page.locator('#paymentLinkName').fill('Café recién tostado');
  await page.locator('#paymentLinkAmount').fill('42');
  await page.locator('#paymentLinkSubmit').click();
  await expect.poll(() => products.length).toBe(1);
  await page.locator('#merchantStoreTabs [data-dashboard-view="workspace"]').click();
  const preview = editor.frameLocator('iframe');
  await expect(preview.getByRole('heading', { name: 'Café recién tostado' })).toBeVisible();
  await expect(preview.locator('.menu-item__price')).toContainText('42');
  await preview.getByRole('button', { name: 'Añadir Café recién tostado' }).click();
  await preview.locator('.checkout-button').click();
  await expect(preview.locator('[data-pagosya-status]')).toContainText('No se realizará ningún cobro');
  expect(requests.some(r => /cart-checkout|source-project\/file|source-project\/messages/.test(r.path))).toBe(false);
  await expect(editor.locator('#source-revision')).toHaveValue('1');
});
