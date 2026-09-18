import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const kit = (name: string) => readFileSync(new URL(`../../api/src/stores/source-kit/${name}`, import.meta.url), 'utf8');
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const data = { storeName: 'Taller Alba', checkoutMode: 'payment', items: [{ id: 'p1', name: 'Bolso de algodón', description: 'Algodón natural. Hecho en La Paz.', tags: ['Material: Algodón natural'], amount: 15000, currency: 'BOB', stock: 3, imageUrls: [photo, photo.replace('iVBOR', 'iVBOR')] }], locations: [{ id: 'central', name: 'Taller central', address: 'La Paz', pickupEnabled: true, deliveryEnabled: true }], categories: [] };
const files = [
  ...['commerce.js', 'product.html', 'checkout.html', 'commerce-pages.css'].map(path => ({ path, content: kit(path) })),
  { path: 'index.html', content: '<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"><script src="config.js" defer></script><script src="commerce.js" defer></script></head><body><h1>Taller Alba</h1><main id="catalogo" data-pagosya-catalog></main><div data-pagosya-cart></div><p data-pagosya-status role="status"></p></body></html>' },
  { path: 'styles.css', content: 'body{font:16px system-ui;margin:24px;background:#fffdf8;color:#25271e}button{font:inherit;min-height:44px}.menu-item{display:grid;grid-template-columns:1fr auto;gap:16px;max-width:500px}.menu-item__image{width:100%;max-height:240px;object-fit:contain}.menu-item__copy{grid-column:1/-1}.menu-add{min-width:44px}.order-item{list-style:none}.quantity{display:flex;gap:12px}.checkout-button{padding:12px;background:#0750a4;color:white;border-radius:0}.commerce-order{border-top:1px solid #ddd}' },
  { path: 'site.js', content: '' },
  { path: 'config.js', content: `window.PAGOSYA_CONFIG=${JSON.stringify({ slug: 'alba', apiBaseUrl: 'https://store.test/v1', checkoutOrigin: 'https://store.test', productPage: 'product.html', checkoutPage: 'checkout.html', data })};` },
];

test('an authored sibling cart does not duplicate the active checkout form', async ({ page }) => {
  await page.goto('/?demo=1');
  const fixture = structuredClone(files);
  fixture.find(f => f.path === 'checkout.html')!.content = '<!doctype html><html><head><script src="config.js" defer></script><script src="commerce.js" defer></script></head><body><main><div data-pagosya-checkout-page data-pagosya-checkout></div><div data-pagosya-cart data-checkout-review="review"></div></main></body></html>';
  await page.evaluate(async files => {
    const { sourcePreviewDocument } = await import('/src/source-preview.ts');
    const frame = document.createElement('iframe'); frame.title = 'Checkout'; frame.sandbox.add('allow-scripts');
    frame.srcdoc = sourcePreviewDocument({ schemaVersion: 1, brief: { businessType: 'Tienda', audience: 'Clientes', primaryAction: 'Comprar', visualDirection: 'Libre' }, files }, 'checkout.html', { cart: [{ id: 'p1', quantity: 1 }] });
    document.body.append(frame);
  }, fixture);
  const frame = page.frameLocator('iframe[title="Checkout"]');
  await expect(frame.getByRole('button', { name: 'Continuar al pago de prueba' })).toHaveCount(1);
  await frame.getByRole('button', { name: 'Continuar al pago de prueba' }).click();
  await expect(frame.getByRole('button', { name: 'Completar prueba' })).toHaveCount(1);
});

test('header anchors stay inside the sandbox and preserve the cart in browser preview', async ({ page }) => {
  const snapshot = { schemaVersion: 1, brief: { businessType: 'Tienda', audience: 'Clientes', primaryAction: 'Comprar', visualDirection: 'Editorial' }, files: files.map(file => file.path === 'index.html' ? {
    ...file, content: file.content.replace('<body>', '<body><nav style="position:fixed;top:0;background:white;z-index:10"><a href="#catalogo">Catálogo</a> <a href="#c%C3%B3mo-elegir"><span>Cómo elegir</span></a> <a href="#">Inicio</a> <a href="#checkout">Checkout</a></nav>')
      .replace('</body>', '<section id="cómo-elegir" style="margin-top:1600px;min-height:100vh"><h2>Elige tu formato</h2></section></body>'),
  } : file) };
  const saved = { revision: 1, label: 'Taller Alba', snapshot };
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.endsWith('/versions/1') ? saved : path.endsWith('/catalog') ? data : { revision: 1 } });
  });
  await page.goto('/?source=1&browser=1&store=s1&revision=1&page=index.html');
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: 'Añadir Bolso de algodón', exact: true }).click();
  await expect(frame.locator('.order-item')).toContainText('Bolso de algodón');
  await frame.getByRole('link', { name: 'Cómo elegir', exact: true }).click();
  await expect(frame.getByRole('heading', { name: 'Elige tu formato' })).toBeInViewport();
  await expect(frame.locator('.order-item')).toContainText('Bolso de algodón');
  await frame.getByRole('link', { name: 'Catálogo', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(frame.getByRole('heading', { name: 'Bolso de algodón' })).toBeInViewport();
  await frame.getByRole('link', { name: 'Inicio', exact: true }).click();
  await expect(frame.getByRole('heading', { name: 'Taller Alba' })).toBeInViewport();
  await frame.getByRole('link', { name: 'Checkout', exact: true }).click();
  await expect(frame.getByRole('heading', { name: 'Revisa tu pedido' })).toBeVisible();
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
});

for (const width of [1280, 390]) test(`full product tabs and automatic checkout preserve the cart in sandbox preview at ${width}px`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 }); await page.goto('/?demo=1');
  await page.evaluate(async files => {
    const { sourcePreviewDocument } = await import('/src/source-preview.ts' as string);
    const snapshot = { schemaVersion: 1, brief: { businessType: 'Tienda', audience: 'Clientes', primaryAction: 'Comprar', visualDirection: 'Editorial' }, files };
    document.body.innerHTML = ''; document.body.style.margin = '0';
    const frame = document.createElement('iframe'); frame.sandbox.add('allow-scripts'); frame.style.cssText = 'width:100%;height:100vh;border:0'; document.body.append(frame);
    const navigate = (name: string, navigation = {}) => { frame.srcdoc = sourcePreviewDocument(snapshot, name, navigation); };
    window.addEventListener('message', event => { if (event.source === frame.contentWindow && event.data?.type === 'pagosya:source-navigate') navigate(event.data.page, event.data); });
    navigate('index.html');
  }, files);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('link', { name: 'Ver detalle de Bolso de algodón' }).click();
  await expect(frame.getByRole('heading', { name: 'Bolso de algodón' })).toBeVisible();
  // The description reads once under the title; the Detalles tab carries facts such as the material.
  await expect(frame.locator('.product-detail__intro')).toHaveText('Algodón natural. Hecho en La Paz.');
  await expect(frame.getByRole('tabpanel')).toContainText('Algodón natural');
  await expect(frame.getByRole('button', { name: 'Añadir al pedido', exact: true })).toHaveCSS('background-color', 'rgb(7, 80, 164)');
  await expect(frame.getByRole('button', { name: 'Añadir al pedido', exact: true })).toHaveCSS('border-radius', '0px');
  await frame.getByRole('tab', { name: 'Detalles', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(frame.getByRole('tab', { name: 'Envíos y retiro' })).toHaveAttribute('aria-selected', 'true');
  await expect(frame.getByRole('tabpanel')).toContainText('Retiro en tienda · Entrega a domicilio');
  await frame.getByRole('button', { name: 'Añadir al pedido', exact: true }).click();
  await expect(frame.locator('[data-cart-count]')).toHaveText('1');
  await page.screenshot({ path: `/tmp/pagosya-product-${width}.png`, fullPage: true });
  expect(await frame.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth)).toBe(true);
  await frame.getByRole('button', { name: 'Continuar con mi pedido' }).click();
  await expect(frame.getByRole('heading', { name: 'Revisa tu pedido' })).toBeVisible();
  await expect(frame.locator('.order-item')).toContainText('Bolso de algodón');
  const increment = frame.getByRole('button', { name: 'Añadir una unidad de Bolso de algodón' });
  await increment.focus(); await page.keyboard.press('Enter');
  await expect(increment).toBeFocused();
  const decrement = frame.getByRole('button', { name: 'Quitar una unidad de Bolso de algodón' });
  await decrement.focus(); await page.keyboard.press('Enter');
  await expect(decrement).toBeFocused();
  await frame.getByRole('combobox', { name: 'Entrega', exact: true }).selectOption('delivery');
  await frame.getByRole('textbox', { name: 'Dirección y referencia' }).fill('Calle 10, puerta azul');
  await page.screenshot({ path: `/tmp/pagosya-checkout-${width}.png`, fullPage: true });
  expect(await frame.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(frame.getByRole('button', { name: 'Continuar al pago de prueba' })).toHaveCSS('background-color', 'rgb(7, 80, 164)');
  await expect(frame.getByRole('button', { name: 'Continuar al pago de prueba' })).toHaveCSS('border-radius', '0px');
  await frame.getByRole('button', { name: 'Continuar al pago de prueba' }).click();
  await expect(frame.getByRole('heading', { name: 'Pago de prueba' })).toBeVisible();
  await frame.getByRole('button', { name: 'Completar prueba' }).click();
  await expect(frame.locator('[data-pagosya-checkout] [data-pagosya-status]')).toContainText('Prueba completada');
  expect(errors).toEqual([]);
});

test('exported pages refresh the catalog and create a PagosYa checkout with the selected fulfillment', async ({ page }) => {
  let checkoutBody: any; const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://store.test/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/cart-checkout')) { checkoutBody = route.request().postDataJSON(); return route.fulfill({ json: { clientSecret: 'test-checkout-secret' } }); }
    if (url.pathname.endsWith('/store')) return route.fulfill({ json: data });
    if (url.pathname === '/s/alba') return route.fulfill({ contentType: 'text/html', body: '<h1>PagosYa</h1>' });
    const file = files.find(f => f.path === url.pathname.slice(1));
    return route.fulfill({ contentType: url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html', body: file?.content || '' });
  });
  await page.goto('https://store.test/product.html?id=p1');
  await page.getByRole('button', { name: 'Añadir al pedido', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar con mi pedido' }).click();
  await expect(page).toHaveURL('https://store.test/checkout.html');
  await expect(page.locator('.order-item')).toContainText('Bolso de algodón');
  await page.getByRole('combobox', { name: 'Entrega', exact: true }).selectOption('delivery');
  await page.getByRole('textbox', { name: 'Dirección y referencia' }).fill('Calle 10, puerta azul');
  await page.getByRole('button', { name: 'Pagar con pagosYa' }).click();
  await expect(page).toHaveURL('https://store.test/s/alba#client_secret=test-checkout-secret');
  expect(checkoutBody).toEqual({ items: [{ paymentLinkId: 'p1', quantity: 1 }], locationId: 'central', fulfillmentMethod: 'delivery', shippingAddress: 'Calle 10, puerta azul' });
  expect(errors).toEqual([]);
});

test('image preparation accepts 24 references and reduces large source dimensions', async ({ page }) => {
  await page.goto('/?demo=1');
  const result = await page.evaluate(async () => {
    const { prepareSourceImage } = await import('/src/source-images.ts' as string);
    const canvas = document.createElement('canvas'); canvas.width = 3000; canvas.height = 2400; canvas.getContext('2d')!.fillRect(0, 0, 3000, 2400);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!)));
    const files = await Promise.all(Array.from({ length: 24 }, (_, i) => prepareSourceImage(new File([blob], `image-${i}.png`, { type: 'image/png' }))));
    const image = await createImageBitmap(files[0]);
    return { count: files.length, width: image.width, bytes: files.reduce((n, f) => n + f.size, 0) };
  });
  expect(result.count).toBe(24); expect(result.width).toBeLessThanOrEqual(1600); expect(result.bytes).toBeLessThan(6 * 1024 * 1024);
});

test('opening a selected product in the browser preserves its query', async ({ page, context }) => {
  const snapshot = {schemaVersion: 1, brief: {businessType:'Tienda', audience:'Clientes', primaryAction:'Comprar', visualDirection:'Editorial'}, files};
  const saved = {revision: 1, label:'Taller Alba', snapshot};
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await context.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/stores') ? [{id:'s1', name:'Taller Alba', slug:'alba'}] : path.endsWith('/conversation') ? {messages:[]} : path.endsWith('/source-project') ? {revision:1, versions:[saved], nextBefore:null} : path.endsWith('/versions/1') ? saved : path.endsWith('/catalog') ? data : {};
    await route.fulfill({json: body});
  });
  await page.goto('/?source=1');
  await page.frameLocator('iframe[title="Vista previa del sitio"]').getByRole('link', {name:'Ver detalle de Bolso de algodón'}).click();
  await expect(page.frameLocator('iframe[title="Vista previa del sitio"]').getByRole('heading', {name:'Bolso de algodón'})).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', {name:'Ver en navegador', exact:true}).click();
  const popup = await popupPromise;
  expect(new URL(popup.url()).searchParams.get('query')).toBe('?id=p1');
  await expect(popup.frameLocator('iframe').getByRole('heading', {name:'Bolso de algodón'})).toBeVisible();
  await popup.close();
});

test('image-only messages do not invent a logo role and show contextual replies', async ({ page }) => {
  let sent: any; const step = 'conversation';
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: any = {};
    if (path.endsWith('/stores')) body = [{id:'s1', name:'Taller Alba', slug:'alba'}];
    else if (path.endsWith('/source-project')) body = {revision:0, versions:[], nextBefore:null};
    else if (path.endsWith('/conversation')) body = {messages:[], setup:{step,prompt:'Cuéntame qué quieres crear. Puedes adjuntar imágenes.',options:[]}};
    else if (path.endsWith('/uploads')) body = {url:'/v1/uploads/abc.png'};
    else if (path.endsWith('/messages')) {sent=route.request().postDataJSON(); body={userMessage:{id:'u1',role:'USER',content:sent.instruction},assistantMessage:{id:'a1',role:'ASSISTANT',content:'¿Esta imagen es tu logo o una referencia de estilo?',metadata:{sourceSetup:{step}}},setup:{step,prompt:'Cuéntame sobre tu marca.',options:[]}};}
    await route.fulfill({json:body});
  });
  await page.goto('/?source=1');
  await page.locator('[data-image-input]').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from(await page.evaluate(() => {const canvas = document.createElement('canvas'); canvas.width=32; canvas.height=32; canvas.getContext('2d')!.fillRect(0,0,32,32); return canvas.toDataURL('image/png').split(',')[1];}), 'base64')});
  await expect(page.locator('.batch-card')).toContainText('Listas para enviar');
  await page.screenshot({path:'/tmp/pagosya-logo-ready.png',fullPage:true});
  await page.getByRole('button',{name:'Enviar a YAPI'}).click();
  await expect(page.locator('.remote-agent-note')).toContainText('¿Esta imagen es tu logo o una referencia de estilo?');
  expect(sent).toMatchObject({setupStep:'conversation',assetUrls:['/v1/uploads/abc.png'],instruction:'Te comparto estas imágenes para el sitio.'});
  await page.screenshot({path:'/tmp/pagosya-logo-submitted.png',fullPage:true});
});
