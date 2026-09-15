import { test, expect } from '@playwright/test';

for (const mobile of [false, true]) test(`create product form saves directly and retains failed uploads (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
  await page.setViewportSize({ width: mobile ? 390 : 1280, height: 844 });
  let creates = 0, uploads = 0, aiMessages = 0, catalogReads = 0;
  const version = { revision: 1, label: 'Tienda', snapshot: { schemaVersion: 1, brief: { businessType: 'Restaurante', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Fotos' }, files: [
    { path: 'index.html', content: '<html><head><title>Tienda</title></head><body><h1>Tienda</h1><div data-pagosya-catalog></div><script src="config.js"></script><script src="commerce.js"></script></body></html>' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG={"data":{"items":[]}};' }, { path: 'commerce.js', content: '' },
  ] } };
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: any = {};
    if (path.endsWith('/stores')) body = [{ id: 's1', name: 'Tienda', slug: 'tienda' }];
    else if (path.endsWith('/conversation')) body = { messages: [] };
    else if (path.endsWith('/catalog')) { catalogReads++; body = { items: [] }; }
    else if (/\/versions\/\d+$/.test(path)) body = version;
    else if (path.endsWith('/source-project')) body = { revision: 1, versions: [version] };
    else if (path.endsWith('/estimate')) body = { estimate: { minCredits: 1, maxCredits: 3 } };
    else if (path.endsWith('/messages')) aiMessages++;
    else if (path.endsWith('/uploads')) { uploads++; body = { url: '/v1/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp' }; }
    else if (path.endsWith('/payment_links')) {
      creates++;
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({ name: 'Hamburguesa de la casa', description: 'Carne 150 g, queso y pan artesanal.', amount: 3550, currency: 'BOB', stock: 12, imageUrls: ['/v1/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp'] });
      if (creates === 1) { await route.fulfill({ status: 503, json: { message: 'No se pudo guardar. Intenta otra vez.' } }); return; }
      body = { id: 'p1', name: 'Hamburguesa de la casa' };
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/?source=1');
  const composer = page.locator('#agent-command');
  await composer.fill('Conservar este mensaje sin enviar');
  const trigger = page.getByRole('button', { name: 'Crear producto', exact: true });
  await trigger.click();
  const dialog = page.getByRole('region', { name: 'Nuevo producto', exact: true });
  await expect(dialog.getByLabel('Nombre del producto', { exact: true })).toBeFocused();
  await expect(composer).toHaveValue('Conservar este mensaje sin enviar');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(dialog.getByText('Paso 1 de 7')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  await dialog.getByLabel('Nombre del producto', { exact: true }).fill('Hamburguesa de la casa');
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await expect(dialog.getByText('Paso 2 de 7')).toBeVisible();
  await dialog.getByRole('button', { name: 'Volver al paso anterior' }).click();
  await expect(dialog.getByLabel('Nombre del producto', { exact: true })).toHaveValue('Hamburguesa de la casa');
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.getByLabel('Descripción del producto').fill('Carne 150 g, queso y pan artesanal.');
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.locator('[data-guide-step="3"]').getByLabel('Precio (Bs)', { exact: true }).fill('35.50');
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.getByLabel(/Añadir fotos/).setInputFiles('tests/fixtures/retention-product.webp');
  await expect(dialog.getByRole('img')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.getByLabel('Stock (opcional)').fill('12');
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  const baselineReads = catalogReads;
  await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Intenta otra vez');
  await expect(dialog.getByLabel('Nombre del producto', { exact: true })).toHaveValue('Hamburguesa de la casa');
  await expect(dialog.getByRole('img')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Producto creado', exact: true })).toBeVisible();
  await expect.poll(() => catalogReads).toBeGreaterThan(baselineReads);
  expect(uploads).toBe(1);
  expect(creates).toBe(2);
  expect(aiMessages).toBe(0);
  await page.getByRole('button', { name: 'Continuar con YAPI', exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(composer).toHaveValue('Conservar este mensaje sin enviar');
  await trigger.click();
  await expect(dialog.getByLabel('Nombre del producto', { exact: true })).toHaveValue('');
  await expect(dialog.getByRole('img')).toHaveCount(0);
  await page.screenshot({ path: `/private/tmp/product-create-${mobile ? 'mobile' : 'desktop'}.png` });
  await dialog.getByRole('button', { name: 'Cancelar creación de producto', exact: true }).click();
  expect(creates).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the product guide saves a specification sheet from Nombre: valor lines', async ({ page }) => {
  let payload: any;
  const version = { revision: 1, label: 'Tienda', snapshot: { schemaVersion: 1, brief: { businessType: 'Tecnología', audience: 'Oficinas', primaryAction: 'Comprar', visualDirection: 'Técnica' }, files: [
    { path: 'index.html', content: '<html><head><title>Tienda</title></head><body><div data-pagosya-catalog></div></body></html>' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG={"data":{"items":[]}};' }, { path: 'commerce.js', content: '' },
  ] } };
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: any = {};
    if (path.endsWith('/stores')) body = [{ id: 's1', name: 'Tienda', slug: 'tienda' }];
    else if (path.endsWith('/conversation')) body = { messages: [] };
    else if (path.endsWith('/catalog')) body = { items: [] };
    else if (/\/versions\/\d+$/.test(path)) body = version;
    else if (path.endsWith('/source-project')) body = { revision: 1, versions: [version] };
    else if (path.endsWith('/payment_links')) { payload = route.request().postDataJSON(); body = { id: 'p1', name: payload.name }; }
    await route.fulfill({ json: body });
  });
  await page.goto('/?source=1');
  await page.getByRole('button', { name: 'Crear producto', exact: true }).click();
  const dialog = page.getByRole('region', { name: 'Nuevo producto', exact: true });
  await dialog.getByLabel('Nombre del producto', { exact: true }).fill('Lámpara USB-C');
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  const sheet = dialog.getByLabel('Ficha técnica (opcional)');
  await sheet.fill('Material: Aluminio\nregulable');
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Escribe “regulable” con el formato Nombre: valor.');
  await expect(sheet).toBeFocused();
  await sheet.fill('Material: Aluminio\n\nAlimentación: USB-C, 5 V');
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.locator('[data-guide-step="3"]').getByLabel('Precio (Bs)', { exact: true }).fill('220');
  for (let step = 3; step < 7; step++) await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Producto creado', exact: true })).toBeVisible();
  expect(payload.specifications).toEqual([{ label: 'Material', value: 'Aluminio' }, { label: 'Alimentación', value: 'USB-C, 5 V' }]);
});

test('YAPI creates a styled scene from the uploaded product photo only after the merchant reviews it', async ({ page }) => {
  let payload: any, sceneRequest: any, uploads = 0;
  const version = { revision: 1, label: 'Tienda', snapshot: { schemaVersion: 1, brief: { businessType: 'Jugos', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Fotos' }, files: [
    { path: 'index.html', content: '<html><head><title>Tienda</title></head><body><div data-pagosya-catalog></div></body></html>' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG={"data":{"items":[]}};' }, { path: 'commerce.js', content: '' },
  ] } };
  const photo = 'tests/fixtures/retention-product.webp';
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/v1/uploads/*.jpg', route => route.fulfill({ path: photo, contentType: 'image/webp' }));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: any = {};
    if (path.endsWith('/stores')) body = [{ id: 's1', name: 'Tienda', slug: 'tienda' }];
    else if (path.endsWith('/conversation')) body = { messages: [] };
    else if (path.endsWith('/catalog')) body = { items: [] };
    else if (/\/versions\/\d+$/.test(path)) body = version;
    else if (path.endsWith('/source-project')) body = { revision: 1, versions: [version] };
    else if (path.endsWith('/uploads')) { uploads++; body = { url: '/v1/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp', assetId: 'a1' }; }
    else if (path.endsWith('/product-scenes')) { sceneRequest = route.request().postDataJSON(); body = { url: '/v1/uploads/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg', parentUrl: sceneRequest.imageUrl, kind: 'AI_DERIVED' }; }
    else if (path.endsWith('/payment_links')) { payload = route.request().postDataJSON(); body = { id: 'p1', name: payload.name }; }
    await route.fulfill({ json: body });
  });
  await page.goto('/?source=1');
  await page.getByRole('button', { name: 'Crear producto', exact: true }).click();
  const dialog = page.getByRole('region', { name: 'Nuevo producto', exact: true });
  await dialog.getByLabel('Nombre del producto', { exact: true }).fill('Jugo naranja + jengibre');
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.locator('[data-guide-step="3"]').getByLabel('Precio (Bs)', { exact: true }).fill('18');
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.getByLabel(/Añadir fotos/).setInputFiles(photo);
  await dialog.getByRole('button', { name: 'Crear escena con la foto 1' }).click();
  await dialog.getByRole('radio', { name: 'Natural' }).check();
  await dialog.getByLabel('Detalle opcional').fill('mesa de desayuno');
  await dialog.locator('[data-scene-generate]').click();
  await expect(dialog.getByRole('button', { name: 'Añadir a las fotos' })).toBeFocused();
  await dialog.locator('[data-product-scene]').screenshot({ path: '.test-artifacts/product-scene-review.png' });
  expect(sceneRequest).toMatchObject({ imageUrl: '/v1/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp', productName: 'Jugo naranja + jengibre', setting: 'natural', note: 'mesa de desayuno' });
  await expect(dialog.locator('[data-product-photos] img')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Añadir a las fotos' }).click();
  await expect(dialog.locator('[data-product-photos] img')).toHaveCount(2);
  await expect(dialog.locator('[data-product-photos]')).toContainText('Escena YAPI');
  for (let step = 4; step < 7; step++) await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Producto creado', exact: true })).toBeVisible();
  expect(uploads).toBe(1);
  expect(payload.imageUrls).toEqual(['/v1/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp', '/v1/uploads/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
