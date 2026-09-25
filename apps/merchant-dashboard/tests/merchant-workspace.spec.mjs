import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

async function openNav(page, view) {
  const link = page.locator(`#dashboardNav [data-dashboard-view="${view}"]`).first();
  if (!await link.isVisible()) {
    await page.locator(`#dashboardNav .dashboard-nav-group:has([data-dashboard-view="${view}"]) > summary`).click();
  }
  return link;
}

async function workspace(page, withSite = false) {
  let version = { revision: 1, label: 'Sitio guardado', snapshot: { schemaVersion: 1, brief: {}, files: [
    { path: 'index.html', content: '<h1>Mi café</h1><div data-pagosya-catalog></div><div data-pagosya-cart></div><p data-pagosya-status></p><script src="config.js"></script><script src="commerce.js"></script>' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"items":[],"categories":[]}};' },
    { path: 'commerce.js', content: readFileSync(kitPath('commerce.js'), 'utf8') },
  ] } };
  const originalVersion = structuredClone(version);
  const stores = ['Café Aroma', 'Taller Norte'].map((name, i) => ({ id: `store_${i + 1}`, merchantId: 'm1', slug: `tienda-${i + 1}`, name, status: 'ACTIVE', websiteRevision: 0, heroSlides: [], contentOrder: ['hero', 'products'], editorialGallery: [], links: [], locations: [], animations: [], checkoutMode: 'payment', cartRecommendationProductIds: [] }));
  const products = [], requests = [], conversations = new Map();
  const steps = ['business', 'logo', 'products', 'colors', 'review'];
  const prompt = step => ({ business: '¿Qué vendes y a quién?', logo: '¿Tienes un logo?', products: '¿Qué productos quieres destacar?', colors: '¿Qué colores representan tu marca?', review: '¿Creamos la primera versión?' })[step];
  const setup = step => ({ step, prompt: prompt(step), options: step === 'review' ? [{ label: 'Crear mi sitio', value: 'Crear mi sitio', action: 'generate' }] : [] });
  await page.addInitScript(() => {
    // Playwright also injects this into the opaque-origin storefront sandbox.
    // Only the dashboard and its same-origin Studio need the merchant session.
    if (location.protocol !== 'http:') return;
    sessionStorage.setItem('pagosya_merchant_session', 'workspace-test');
    sessionStorage.setItem('pagosya_merchant_email', 'merchant@example.com');
  });
  await page.context().route('http://localhost:3001/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.slice(3), method = request.method();
    requests.push({ path, method, body: request.postData() ? request.postDataJSON() : null });
    let body = [];
    const storeId = path.split('/')[2];
    if (!conversations.has(storeId)) conversations.set(storeId, { messages: [], step: 'business' });
    const conversation = conversations.get(storeId);
    if (path === '/stores') body = stores;
    else if (path.endsWith('/source-project')) body = { revision: withSite ? version.revision : 0, versions: withSite ? [version] : [], nextBefore: null };
    else if (path.endsWith('/visual-fields')) body = { revision: version.revision, fields: [{ id: 'heading', path: 'src/main.tsx', label: 'Título principal', kind: 'text', value: version.snapshot.files[0].content.match(/<h1>(.*?)<\/h1>/)[1] }] };
    else if (path.endsWith('/visual-edit')) {
      const input = request.postDataJSON(); expect(input.revision).toBe(version.revision);
      version = structuredClone(version); version.revision += 1;
      version.snapshot.files[0].content = version.snapshot.files[0].content.replace(/<h1>.*?<\/h1>/, `<h1>${input.value}</h1>`);
      body = { revision: version.revision, label: 'Cambio visual' };
    }
    else if (path.endsWith('/versions/1/restore')) { version = { ...structuredClone(originalVersion), revision: version.revision + 1 }; body = { revision: version.revision }; }
    else if (/\/versions\/\d+$/.test(path)) body = version;
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
      if (method === 'POST') { const input = request.postDataJSON(); const product = { ...input, id: 'p1', currency: 'BOB', status: 'ACTIVE', imageUrls: [], createdAt: new Date().toISOString() }; products.push(product); body = product; } else body = products;
    } else if (path.endsWith('/visual-studio')) body = { proposals: [], versions: [] };
    else if (path === '/merchants/balance') body = { payableBalance: 0 };
    else if (path === '/merchants/kyc') body = { status: 'APPROVED' };
    else if (path === '/merchants/invoicing_profile') body = { status: 'NOT_CONFIGURED' };
    else if (path === '/merchants/finances') body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: 'BOB' };
    else if (path === '/auth/google') body = { enabled: false };
    else if (path.endsWith('/domain-shop')) body = { available: false, sandbox: true, tlds: [], orders: [] };
    else if (path.endsWith('/product-highlights/suggestions')) body = { highlights: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/#dashboard-stores');
  await page.locator('.store-row[data-id="store_1"] .store-row-name').click();
  const editor = page.frameLocator('#merchantStudioFrame');
  if (withSite) await expect(editor.frameLocator('iframe[title="Vista previa del sitio"]').getByRole('heading', { name: 'Mi café' })).toBeVisible();
  else await expect(editor.locator('[data-setup-prompt]')).toHaveText(prompt('business'));
  return { editor, products, requests };
}

// New products are created through YAPI's eight-step guide in #productGuideFrame.
async function createProductWithGuide(page, name, price) {
  const guide = page.frameLocator('#productGuideFrame');
  const next = guide.locator('.product-next');
  const reach = step => expect(guide.locator('[data-product-step]')).toHaveText(`Paso ${step} de 8`);
  await guide.getByLabel('Nombre del producto').fill(name);
  for (let step = 1; step < 8; step++) {
    await reach(step);
    if (step === 3) await guide.getByLabel('Precio (Bs)').fill(price);
    await next.click();
  }
  await reach(8);
  await next.click();
  await expect(guide.getByText(`${name} ya está en tu catálogo.`)).toBeVisible();
}

test('retired sections are absent and old view selections fall back to the overview', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const loadedResources = []; page.on('request', request => loadedResources.push(new URL(request.url()).pathname));
  const { requests } = await workspace(page);
  // 'growth' was retired once and came back as Crecimiento (G2, tests/growth.spec.mjs).
  for (const view of ['operations', 'events', 'settings', 'appearance']) {
    await expect(page.locator(`[data-dashboard-view="${view}"], [data-dashboard-page="${view}"]`)).toHaveCount(0);
    await page.evaluate(view => window.setDashboardView(view), view);
    await expect(page.locator('body')).toHaveAttribute('data-dashboard-view', 'overview');
  }
  // `#storeSettingsRoot` is not retired: it is the mount point of the store settings
  // page that replaced the old Apariencia editor, and store-settings.spec.mjs covers it.
  await expect(page.locator('#storeSettingsPage, #customDomainStudio')).toHaveCount(0);
  expect(loadedResources.some(path => /\/domain-shop\.(?:mjs|css)$/.test(path))).toBe(false);
  expect(requests.some(request => request.path.startsWith('/events') || request.path.endsWith('/operations/hub'))).toBe(false);
  if (await page.locator('body').getAttribute('data-dashboard-view') === 'workspace') await page.frameLocator('#merchantStudioFrame').locator('#source-back-stores').click();
  if (await page.locator('#storeFullscreenNavHandle').isVisible()) await page.locator('#storeFullscreenNavHandle').click();
  await (await openNav(page, 'products')).click();
  await expect(page.locator('#paymentLinksSection')).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: '.test-artifacts/retired-sections-desktop.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.test-artifacts/retired-sections-mobile.png', fullPage: false });
});

test('store opens the shared editor; setup and an unsent message survive product management and reload', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const { editor, products, requests } = await workspace(page);
  await expect(page.locator('body')).toHaveAttribute('data-dashboard-view', 'workspace');
  await expect(page.locator('#onboardingDialog')).not.toBeVisible();
  await expect(page.locator('#merchantStoreTabs')).not.toBeVisible();
  await expect(page.locator('.dashboard-sidebar')).toBeVisible();
  const bounds = await page.locator('#merchantStudioFrame').boundingBox();
  // The frame fills everything right of the rail. Its exact width is pinned by
  // the compact-navigation test; here only the relationship matters.
  const rail = (await page.locator('.dashboard-sidebar').boundingBox()).width;
  expect(bounds).toEqual({ x: rail, y: 0, width: page.viewportSize().width - rail, height: page.viewportSize().height });
  await expect(editor.locator('#source-store')).not.toBeVisible();
  const composer = editor.getByRole('textbox', { name: 'Indicación para YAPI' });
  await composer.fill('Café de especialidad para el barrio'); await editor.getByRole('button', { name: 'Enviar a YAPI' }).click();
  await expect(editor.locator('.remote-agent-note').last()).toContainText('logo');
  await page.reload(); await expect(editor.locator('.remote-agent-note').last()).toContainText('logo');
  await composer.fill('Usar solo mi nombre'); await editor.getByRole('button', { name: 'Enviar a YAPI' }).click();
  await expect(editor.locator('.remote-agent-note').last()).toContainText('productos');
  await composer.fill('Destacar el café en grano');
  await editor.locator('.store-readiness > summary').click();
  await editor.getByRole('button', { name: 'Revisar productos', exact: true }).click();

  await expect(page.locator('#paymentLinksSection')).toBeVisible();
  await createProductWithGuide(page, 'Café en grano', '65');
  await expect.poll(() => products.length).toBe(1);
  expect(products[0].amount).toBe(6500);
  expect(requests.find(r => r.method === 'POST' && r.path.endsWith('/payment_links')).path).toBe('/stores/store_1/payment_links');
  await page.locator('#dashboardNav [data-dashboard-view="workspace"]:not([data-studio-tool])').click();
  await expect(composer).toHaveValue('Destacar el café en grano');
  await editor.getByRole('button', { name: 'Enviar a YAPI' }).click();
  await expect(editor.locator('.remote-agent-note').last()).toContainText('colores');
  await composer.fill('Verde bosque y crema'); await editor.getByRole('button', { name: 'Enviar a YAPI' }).click();
  await expect(editor.locator('.remote-agent-note').last()).toContainText('¿Creamos la primera versión?');
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

test('AI setup opens the YAPI conversation without the retired four-step wizard', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const { editor, requests } = await workspace(page);
  if (await page.locator('body').getAttribute('data-dashboard-view') === 'workspace') await page.frameLocator('#merchantStudioFrame').locator('#source-back-stores').click();
  if (await page.locator('#storeFullscreenNavHandle').isVisible()) await page.locator('#storeFullscreenNavHandle').click();
  await page.locator('#dashboardNav [data-dashboard-view="products"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-dashboard-view', 'products');
  if (await page.locator('body').getAttribute('data-dashboard-view') === 'workspace') await page.frameLocator('#merchantStudioFrame').locator('#source-back-stores').click();
  if (await page.locator('#storeFullscreenNavHandle').isVisible()) await page.locator('#storeFullscreenNavHandle').click();
  await page.locator('#aiSetupLaunch').click();
  await expect(page.locator('body')).toHaveAttribute('data-dashboard-view', 'workspace');
  await expect(editor.locator('[data-setup-prompt]')).toBeVisible();
  await expect(page.locator('#onboardingDialog')).toHaveCount(0);
  expect(requests.some(req => req.method === 'POST' && /visual-proposals|agent-conversation/.test(req.path))).toBe(false);
  expect(errors).toEqual([]);
});

test('switching stores protects unsent work and scopes the editor; untrusted messages cannot navigate', async ({ page }) => {
  const { editor } = await workspace(page);
  const composer = editor.getByRole('textbox', { name: 'Indicación para YAPI' });
  await composer.fill('Un mensaje sin enviar');
  if (await page.locator('body').getAttribute('data-dashboard-view') === 'workspace') await page.frameLocator('#merchantStudioFrame').locator('#source-back-stores').click();
  if (await page.locator('#storeFullscreenNavHandle').isVisible()) await page.locator('#storeFullscreenNavHandle').click();
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
  await page.context().route('http://localhost:3001/v1/uploads/1111-aaaa.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') }));
  if (await page.locator('body').getAttribute('data-dashboard-view') === 'workspace') await page.frameLocator('#merchantStudioFrame').locator('#source-back-stores').click();
  if (await page.locator('#storeFullscreenNavHandle').isVisible()) await page.locator('#storeFullscreenNavHandle').click();
  await page.locator('#dashboardNav [data-dashboard-view="products"]').click();
  await createProductWithGuide(page, 'Café recién tostado', '42');
  await expect.poll(() => products.length).toBe(1);
  products[0].imageUrls = ['/v1/uploads/1111-aaaa.png'];
  await page.locator('#dashboardNav [data-dashboard-view="workspace"]:not([data-studio-tool])').click();
  const preview = editor.frameLocator('iframe[title="Vista previa del sitio"]');
  await expect(preview.getByRole('heading', { name: 'Café recién tostado' })).toBeVisible();
  await expect(preview.locator('.menu-item__price')).toContainText('42');
  await expect.poll(() => preview.locator('.menu-item__image').evaluate(image => image.naturalWidth)).toBe(1);
  await preview.getByRole('button', { name: 'Ver detalle de Café recién tostado' }).click();
  await expect(preview.getByRole('dialog', { name: 'Café recién tostado' })).toBeVisible();
  await preview.getByRole('button', { name: 'Cerrar detalle del producto' }).click();
  await preview.getByRole('button', { name: 'Añadir Café recién tostado' }).click();
  await preview.getByRole('button', { name: 'Continuar con mi pedido', exact: true }).click();
  await expect(preview.getByRole('heading', { name: 'Revisa tu pedido' })).toBeVisible();
  await preview.getByRole('button', { name: 'Continuar al pago de prueba' }).click();
  const payment = editor.getByRole('dialog', { name: 'Formulario de pago de pagosYa' });
  await expect(payment).toBeVisible();
  await expect(payment.locator('iframe')).toHaveAttribute('src', /source_payment_preview=1/);
  await expect(payment.locator('iframe')).toHaveAttribute('src', /amount=4200/);
  await payment.getByRole('button', { name: 'Volver al pedido' }).click();
  await expect(payment).toHaveCount(0);
  await expect(preview.getByRole('heading', { name: 'Revisa tu pedido' })).toBeVisible();
  expect(requests.some(r => /cart-checkout|source-project\/file|source-project\/messages/.test(r.path))).toBe(false);
  await expect(editor.locator('.save-state')).toContainText('Diseño guardado');
  const opened = page.waitForEvent('popup');
  await editor.getByRole('button', { name: 'Ver en navegador', exact: true }).click();
  const browser = await opened;
  await expect(browser.getByText('Vista previa · Sin cobros', { exact: true })).toBeVisible();
  expect(new URL(browser.url()).searchParams.get('revision')).toBe('1');
  const fullPreview = browser.frameLocator('iframe');
  await expect(fullPreview.getByRole('heading', { name: 'Café recién tostado' })).toBeVisible();
  await expect.poll(() => fullPreview.locator('.menu-item__image').evaluate(image => image.naturalWidth)).toBe(1);
  expect(await browser.evaluate(() => window.opener)).toBeNull();
  await browser.reload();
  await expect(fullPreview.getByRole('heading', { name: 'Café recién tostado' })).toBeVisible();
  await browser.close();
});

async function retentionFixture(page) {
  const settings = { revision: 1, comebackEnabled: true, visitsRequired: 5, rewardLabel: 'Un café gratis', timezone: 'America/La_Paz', signupEnabled: true, signupTitle: 'Nuestro club', signupBody: 'Novedades de la tienda', signupButton: 'Unirme', welcomeEnabled: false, welcomeSubject: 'Bienvenido', welcomeBody: 'Hola {{store}}', recoveryEnabled: false, recoveryHours: 24, reviewRequestsEnabled: false };
  await page.route('**/stores/*/retention', route => route.fulfill({ json: { settings, cards: 12, subscriberCount: 7, carts: 3, campaigns: [{ id: 'c1', subject: 'Novedades de septiembre', body: 'Visítanos', _count: { deliveries: 0 } }], subscribers: [{ name: 'Ana', email: 'ana@example.com', createdAt: '2026-09-14T12:00:00Z' }], deliveries: [], emailConfigured: true } }));
}

test('Comeback, campaigns and customers show distinct pages with the current font', async ({ page }) => {
  await retentionFixture(page);
  await workspace(page, { withSite: true });
  await expect(page.locator('[data-dashboard-view="content"], [data-dashboard-page="content"]')).toHaveCount(0);
  await page.evaluate(() => window.setDashboardView('marketing'));
  await page.locator('[data-marketing-tab="program"]').click();
  const frame = page.frameLocator('#storeMarketingFrame');
  await expect(frame.getByRole('heading', { name: 'Comeback Card', exact: true })).toBeVisible();
  await expect(frame.locator('.comeback-card')).toBeVisible();
  await expect(frame.locator('body')).not.toContainText('Cargando las herramientas');
  expect(await frame.locator('.retention-dialog').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Arial');
  await page.screenshot({ path: '/tmp/pagosya-comeback-desktop.png', fullPage: true });
  await page.locator('[data-marketing-tab="campaigns"]').click();
  await expect(frame.locator('h2')).toHaveText('Campañas');
  await expect(frame.locator('[data-campaign]')).toBeVisible();
  await expect(frame.locator('[data-settings], [data-redeem], .comeback-card')).toHaveCount(0);
  await page.locator('[data-marketing-tab="customers"]').click();
  await expect(frame.locator('h2')).toHaveText('Clientes y canjes');
  await expect(frame.getByText('ana@example.com', { exact: false })).toBeVisible();
  await expect(frame.locator('[data-redeem]')).toBeVisible();
  await expect(frame.locator('[data-campaign], [data-settings]')).toHaveCount(0);
  await page.locator('[data-marketing-tab="program"]').click();
  await expect(frame.locator('.comeback-card')).toBeVisible();
  await frame.locator('[name=visitsRequired]').fill('8');
  await frame.locator('[name=rewardLabel]').fill('Tu bebida favorita');
  await expect(frame.locator('.comeback-stamps li')).toHaveCount(8);
  await expect(frame.locator('.comeback-reward')).toHaveText('Tu bebida favorita');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(frame.locator('.comeback-card')).toBeVisible();
  expect(await frame.locator('body').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: '/tmp/pagosya-comeback-mobile.png', fullPage: true });
});

test('integration logos load and provider details preserve the inventory draft', async ({ page }) => {
  await retentionFixture(page);
  await workspace(page, { withSite: true });
  await page.evaluate(() => window.setDashboardView('integrations'));
  const frame = page.frameLocator('#storeIntegrationsFrame');
  await expect(frame.locator('.integration-card')).toHaveCount(20);
  const logos = frame.locator('.integration-logo img');
  for (const logo of await logos.all()) {
    await logo.scrollIntoViewIfNeeded();
    await expect(logo).toHaveJSProperty('complete', true);
    expect(await logo.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  }
  await frame.locator('[name=name]').fill('Mi inventario');
  await frame.locator('[data-open-integration=tiktok-ads]').click();
  // Providers now carry their own ID field instead of an apology; matches
  // source-business-workspace.test.ts.
  await expect(frame.locator('.integration-detail')).toContainText('pega su ID para activarlo aquí');
  await expect(frame.locator('.integration-detail a').first()).toHaveAttribute('href', 'https://ads.tiktok.com/');
  await expect(frame.locator('[name=name]')).toHaveValue('Mi inventario');
  await frame.locator('[data-close-integration]').click();
  await expect(frame.locator('.integration-detail')).toHaveCount(0);
  await expect(frame.locator('[data-open-integration=tiktok-ads]')).toBeFocused();
  await page.screenshot({ path: '/tmp/pagosya-integrations.png', fullPage: true });
});


test('compact navigation stays at the edge and the idle canvas keeps the draft', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const { editor, requests } = await workspace(page);
  const rail = await page.locator('.dashboard-sidebar').boundingBox();
  // 64px is the <=999px icon rail; at 1440 the labeled sidebar is --sidebar-w.
  expect(rail.x).toBe(0); expect(rail.width).toBe(196); expect(rail.height).toBe(960);
  await expect(page.getByRole('link', { name: 'Diseñar sitio', exact: true })).toHaveAttribute('aria-current', 'page');
  const composer = editor.getByRole('textbox', { name: 'Indicación para YAPI' });
  await composer.fill('Una tienda con mi propia identidad');
  await expect(editor.locator('.source-inspiration')).toBeVisible();
  // What the canvas is made of -- the face, its moods, reduced motion and the
  // fact that it carries no controls -- belongs to the studio's own
  // source-face.spec.ts. This test only guards the frame around it.
  await expect(composer).toHaveValue('Una tienda con mi propia identidad');
  expect(requests.some(r => r.method === 'POST' && /messages|generate/.test(r.path))).toBe(false);
  await page.screenshot({ path: '.test-artifacts/yapi-inspiration-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor.locator('#agent-command')).toBeVisible();
  await expect(composer).toHaveValue('Una tienda con mi propia identidad');
  await page.screenshot({ path: '.test-artifacts/yapi-inspiration-mobile.png' });
});


test('direct canvas editing selects text, saves a revision and supports undo', async ({ page }) => {
  const { editor, requests } = await workspace(page, true);
  await editor.locator('#source-visual-edit').click();
  await expect(editor.locator('[data-direct-value]')).toHaveValue('Mi café');
  await editor.frameLocator('iframe[title="Vista previa del sitio"]').getByRole('heading', { name: 'Mi café' }).click();
  await expect(editor.locator('[data-direct-value]')).toBeFocused();
  await editor.locator('[data-direct-value]').fill('Nuestro café de altura');
  await editor.getByRole('button', { name: 'Guardar cambio', exact: true }).click();
  await expect(editor.frameLocator('iframe[title="Vista previa del sitio"]').getByRole('heading', { name: 'Nuestro café de altura' })).toBeVisible();
  await expect(editor.locator('[data-direct-value]')).toHaveValue('Nuestro café de altura');
  expect(requests.find(row => row.path.endsWith('/visual-edit')).body).toEqual({ revision: 1, fieldId: 'heading', value: 'Nuestro café de altura' });
  await page.screenshot({ path: '.test-artifacts/yapi-direct-edit.png', fullPage: false });
  await editor.getByRole('button', { name: 'Deshacer último cambio visual' }).click();
  await expect(editor.frameLocator('iframe[title="Vista previa del sitio"]').getByRole('heading', { name: 'Mi café' })).toBeVisible();
  await expect(editor.locator('[data-direct-undo]')).toHaveCount(0);
  expect(requests.filter(row => row.method === 'POST' && /messages|generate/.test(row.path))).toEqual([]);
});

test('new site purpose is included in the first conversation request', async ({ page }) => {
  const { editor, requests } = await workspace(page);
  await editor.locator('#source-site-purpose').selectOption('portfolio');
  await editor.getByRole('textbox', { name: 'Indicación para YAPI' }).fill('Soy fotógrafa de arquitectura y quiero mostrar mis proyectos.');
  await editor.getByRole('button', { name: 'Enviar a YAPI' }).click();
  await expect.poll(() => requests.find(row => row.path.endsWith('/messages'))?.body.sitePurpose).toBe('portfolio');
});
