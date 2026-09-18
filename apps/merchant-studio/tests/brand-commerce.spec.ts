import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('merchant reviews imported brand evidence, saves rules, and configures shipping on desktop and mobile', async ({ page }) => {
  let brand: any = { revision: 0, data: { confirmed: [], suggested: [] } };
  let shipping: any = { enabled: false, pickupEnabled: true, rates: [] };
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname; const method = route.request().method(); let body: any = {};
    if (path.endsWith('/stores')) body = [{ id: 's1', slug: 'cafe', name: 'Café de prueba' }];
    else if (path.endsWith('/source-project')) body = { revision: 0, versions: [], nextBefore: null };
    else if (path.endsWith('/conversation')) body = { messages: [] };
    else if (path.endsWith('/brand/analyze')) body = brand = { revision: brand.revision + 1, data: { confirmed: brand.data.confirmed, suggested: [{ field: 'accent', value: '#135724', source: 'merchant text', evidence: 'La guía define #135724 como acento.' }] } };
    else if (path.endsWith('/brand')) { if (method === 'PUT') { const value = route.request().postDataJSON(); brand = { revision: value.revision + 1, data: { confirmed: value.confirmed, suggested: value.suggested } }; } body = brand; }
    else if (path.endsWith('/shipping')) { if (method === 'POST') shipping = { ...shipping, ...route.request().postDataJSON() }; body = shipping; }
    else if (path.endsWith('/operations/delivery/zones')) { body = { id: 'rate1', ...route.request().postDataJSON(), isActive: true }; shipping.rates.push(body); }
    else if (path.endsWith('/estimate')) body = { model: 'gpt-5.6-terra', maxCredits: 50, estimate: { minCredits: 4, maxCredits: 16 } };
    await route.fulfill({ json: body });
  });
  await page.goto('/?source=1');
  await page.locator('.source-store-menu > summary').click();
  await page.getByRole('button', { name: 'Identidad de mi marca' }).click();
  await page.getByLabel('Qué hace única a tu marca').fill('Café de origen boliviano.');
  await page.getByText('Importar una web, guía o imágenes', { exact: true }).click();
  await page.getByLabel('Guía, ejemplos de voz o contexto').fill('Nuestro acento oficial es #135724.');
  await page.getByRole('button', { name: 'Analizar referencias' }).click();
  await expect(page.getByRole('heading', { name: 'Lo que entendimos' })).toBeVisible();
  expect(brand.data.confirmed.some((f: any) => f.field === 'accent')).toBe(false);
  await page.getByRole('button', { name: 'Usar esta sugerencia' }).click();
  await page.getByRole('button', { name: 'Guardar identidad' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Identidad guardada' })).toBeVisible();
  expect(brand.data.confirmed.find((f: any) => f.field === 'accent').value).toBe('#135724');
  await page.getByText('Importar una web, guía o imágenes', { exact: true }).click();
  await page.locator('dialog').evaluate(el => el.scrollTop = 0);
  await page.screenshot({ path: '.test-artifacts/brand-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.test-artifacts/brand-mobile.png' });
  expect(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.locator('.source-store-menu > summary').click();
  await page.getByRole('button', { name: 'Envíos y retiro', exact: true }).click();
  await page.getByLabel('Zona y servicio').fill('La Paz'); await page.getByLabel('Costo de envío', { exact: true }).fill('15'); await page.getByLabel('Gratis desde').fill('200');
  await page.getByRole('button', { name: 'Añadir tarifa' }).click();
  await expect(page.getByText('Tarifa guardada.', { exact: true })).toBeVisible();
  expect(shipping.rates[0]).toMatchObject({ fee: 1500, freeAbove: 20000 });
  await page.getByLabel('Activar tarifas de envío en checkout').check(); await page.getByRole('button', { name: 'Guardar opciones' }).click();
  await expect(page.getByText('Opciones de entrega guardadas.')).toBeVisible(); expect(shipping.enabled).toBe(true);
  await page.locator('dialog').evaluate(el => el.scrollTop = 0); await page.screenshot({ path: '.test-artifacts/shipping-mobile.png' });
  expect(errors).toEqual([]);
});

test('published runtime quotes shipping and submits only selected service and address', async ({ page }) => {
  const commerce = readFileSync(new URL('../../api/src/stores/source-kit/commerce.js', import.meta.url), 'utf8');
  let payload: any;
  const store = { storeName: 'Café', checkoutMode: 'payment', shippingEnabled: true, shippingPickupEnabled: false, locations: [], items: [{ id: 'p1', name: 'Café', amount: 10000, currency: 'BOB', stock: 10, imageUrls: [] }], categories: [] };
  await page.goto('/?demo=1');
  await page.route('https://commerce.example/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/store')) return route.fulfill({ json: store });
    if (path.endsWith('/shipping/quote')) return route.fulfill({ json: { subtotal: 10000, shippingAmount: 1500, amount: 11500, currency: 'BOB', shippingOptions: [{ id: 'la-paz', name: 'La Paz', amount: 1500, currency: 'BOB' }] } });
    payload = route.request().postDataJSON(); return route.fulfill({ status: 400, json: { message: 'Prueba sin crear un cobro.' } });
  });
  await page.setContent('<main><div data-pagosya-catalog></div><div data-pagosya-cart></div><p data-pagosya-status></p></main>');
  await page.addScriptTag({ content: `window.PAGOSYA_CONFIG=${JSON.stringify({ slug: 'cafe', apiBaseUrl: 'https://commerce.example/v1', checkoutOrigin: 'https://checkout.example', data: store })};` });
  await page.addScriptTag({ content: commerce });
  await expect(page.getByRole('button', { name: 'Añadir Café', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Añadir Café', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar con mi pedido' }).click();
  const review = page.locator('[data-checkout-review]');
  await review.getByLabel('Dirección').fill('Calle de prueba 123');
  await review.getByRole('button', { name: 'Calcular envío' }).click();
  await review.getByLabel('Opción de envío').selectOption('la-paz');
  await expect(review.locator('[data-shipping-status]')).toContainText('115');
  await review.getByRole('button', { name: 'Pagar con pagosYa' }).click();
  await expect.poll(() => payload).toBeTruthy();
  expect(payload).toMatchObject({ shippingZoneId: 'la-paz', shippingAddress: 'Calle de prueba 123', fulfillmentMethod: 'delivery', items: [{ paymentLinkId: 'p1', quantity: 1 }] });
  expect(payload).not.toHaveProperty('shippingAmount');
});

test('standard checkout shows server totals and requires delivery details', async ({ page }) => {
  await page.goto('/?demo=1');
  const path = '/@fs' + new URL('../../checkout/src/cart-quote.ts', import.meta.url).pathname;
  const requests: any[] = [];
  await page.route('**/stores/public/test/shipping/quote', async route => {
    const input = route.request().postDataJSON(); requests.push(input);
    await route.fulfill({ json: { subtotal: 20000, discountAmount: 2000, shippingAmount: input.shippingZoneId ? 1500 : 0, amount: input.shippingZoneId ? 19500 : 18000, currency: 'BOB', shippingOptions: [{ id: 'r1', name: 'La Paz', amount: 1500, currency: 'BOB' }] } });
  });
  await page.evaluate(async path => {
    const { mountCartQuote } = await import(path);
    document.body.innerHTML = '<main id="quote"></main><output id="total"></output><button id="finish">Continuar</button><p id="result"></p>';
    const get = mountCartQuote(document.querySelector('#quote'), { slug: 'test', items: [{ paymentLinkId: 'p1', quantity: 2 }], shipping: true, pickup: false, money: (n: number) => String(n / 100), onQuote: (q: any) => { document.querySelector('#total')!.textContent = String(q.amount); } });
    document.querySelector('#finish')!.addEventListener('click', () => { try { (window as any).selection = get(); document.querySelector('#result')!.textContent = 'Listo'; } catch (e: any) { document.querySelector('#result')!.textContent = e.message; } });
  }, path);
  await expect(page.locator('#total')).toHaveText('18000');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await expect(page.locator('#result')).toContainText('completa la dirección');
  await page.getByLabel('Dirección de entrega').fill('Calle de prueba 123'); await page.getByLabel('Opción de envío').selectOption('r1');
  await expect(page.locator('#total')).toHaveText('19500'); await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  expect(await page.evaluate(() => (window as any).selection)).toEqual({ fulfillmentMethod: 'delivery', shippingZoneId: 'r1', shippingAddress: 'Calle de prueba 123' });
  expect(requests.at(-1)).not.toHaveProperty('amount');
});

test('hosted source passes shipping through its confined parent bridge', async ({ page }) => {
  const commerce = readFileSync(new URL('../../api/src/stores/source-kit/commerce.js', import.meta.url), 'utf8');
  const store = { storeName: 'Café', checkoutMode: 'payment', shippingEnabled: true, shippingPickupEnabled: false, locations: [], items: [{ id: 'p1', name: 'Café', amount: 10000, currency: 'BOB', stock: 10 }], categories: [] };
  const snapshot = { schemaVersion: 1, brief: {}, files: [
    { path: 'index.html', content: '<main><div data-pagosya-catalog></div><div data-pagosya-cart></div><p data-pagosya-status></p></main><script src="config.js"></script><script src="commerce.js"></script>' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG=' + JSON.stringify({ slug: 'test', data: store }) + ';' }, { path: 'commerce.js', content: commerce },
  ] };
  let checkout: any;
  await page.route('**/stores/public/test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/source-site')) return route.fulfill({ json: { published: true, revision: 1, snapshot } });
    if (path.endsWith('/shipping/quote')) return route.fulfill({ json: { subtotal: 10000, shippingAmount: 1500, amount: 11500, currency: 'BOB', shippingOptions: [{ id: 'r1', name: 'La Paz', amount: 1500, currency: 'BOB' }] } });
    if (path.endsWith('/cart-checkout')) { checkout = route.request().postDataJSON(); return route.fulfill({ json: { clientSecret: 'test-only-secret' } }); }
    if (path.endsWith('/retention')) return route.fulfill({ json: {} });
    throw new Error(path);
  });
  await page.goto('/?demo=1');
  const path = '/@fs' + new URL('../../checkout/src/source-storefront.ts', import.meta.url).pathname;
  await page.evaluate(async ({ path, store }) => {
    const { mountPublishedSource } = await import(path); document.body.innerHTML = '<main id="shop"></main>';
    await mountPublishedSource(document.querySelector('#shop'), 'test', store, async () => { document.querySelector('#shop')!.textContent = 'Pago listo'; });
  }, { path, store });
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: 'Añadir Café', exact: true }).click(); await frame.getByRole('button', { name: 'Continuar con mi pedido' }).click();
  const review = frame.locator('[data-checkout-review]'); await review.getByLabel('Dirección').fill('Calle de prueba 123');
  await review.getByRole('button', { name: 'Calcular envío' }).click(); await review.getByLabel('Opción de envío').selectOption('r1');
  await expect(review.locator('[data-shipping-status]')).toContainText('115'); await review.getByRole('button', { name: 'Pagar con pagosYa' }).click();
  await expect(page.getByText('Pago listo', { exact: true })).toBeVisible();
  expect(checkout).toMatchObject({ shippingZoneId: 'r1', shippingAddress: 'Calle de prueba 123', fulfillmentMethod: 'delivery' });
});

test('merchant publishes content, creates a bundle and moderates reviews', async ({ page }) => {
  let failArticle = true;
  const state: any = { articles: [], bundles: [], reviews: [{ id: 'rv1', productId: 'p1', displayName: 'Compradora', rating: 5, body: 'Excelente café.', status: 'PENDING' }] };
  await page.goto('/?demo=1');
  await page.route('**/api/v1/stores/s1/**', async route => {
    const path = new URL(route.request().url()).pathname; let body: any = state;
    if (path.endsWith('/catalog')) body = { items: [{ id: 'p1', name: 'Café' }] };
    else if (path.endsWith('/articles')) { if (failArticle) { failArticle = false; return route.fulfill({ status: 409, json: { message: 'Prueba: vuelve a guardar.' } }); } body = { id: 'a1', ...route.request().postDataJSON(), revision: 1 }; state.articles.push(body); }
    else if (path.endsWith('/bundles')) { body = { id: 'b1', ...route.request().postDataJSON(), active: true }; state.bundles.push(body); }
    else if (path.endsWith('/reviews/rv1')) { Object.assign(state.reviews[0], route.request().postDataJSON()); body = { status: state.reviews[0].status }; }
    await route.fulfill({ json: body });
  });
  await page.evaluate(async () => {
    const { MerchantStudioApi } = await import('/src/api.ts'); const { openCommerceContent } = await import('/src/commerce-content.ts');
    await openCommerceContent(new MerchantStudioApi(), 's1');
  });
  await page.getByLabel('Título', { exact: true }).fill('Nuestro café'); await page.getByLabel('Dirección del artículo').fill('nuestro-cafe');
  await page.getByLabel('Autor', { exact: true }).fill('La marca'); await page.getByLabel('Artículo', { exact: true }).fill('Cultivado en Bolivia.');
  await page.getByLabel('Publicar en esta fecha').fill('2026-09-07T10:00'); await page.getByRole('button', { name: 'Guardar artículo' }).click();
  await expect(page.locator('dialog [role=status]')).toHaveText('Prueba: vuelve a guardar.');
  await expect(page.getByLabel('Artículo', { exact: true })).toHaveValue('Cultivado en Bolivia.');
  await page.getByRole('button', { name: 'Guardar artículo' }).click();
  await expect.poll(() => state.articles.length).toBe(1); expect(state.articles[0]).toMatchObject({ slug: 'nuestro-cafe', locale: 'es', author: 'La marca' });
  const bundle = page.locator('#bundle-form'); await bundle.getByLabel('Nombre', { exact: true }).fill('Dos cafés');
  await bundle.getByRole('checkbox', { name: 'Café', exact: true }).check(); await bundle.getByLabel('Unidades de Café por paquete').fill('2');
  await page.getByRole('button', { name: 'Crear oferta' }).click(); await expect.poll(() => state.bundles.length).toBe(1);
  expect(state.bundles[0]).toMatchObject({ kind: 'FIXED', items: [{ productId: 'p1', quantity: 2 }], discountPercent: 10 });
  await page.getByRole('button', { name: 'Publicar', exact: true }).click(); await expect.poll(() => state.reviews[0].status).toBe('PUBLISHED');
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('dialog').evaluate(el => el.scrollTop = 0);
  const bounds = (await page.locator('dialog').boundingBox())!; expect(bounds.y).toBeGreaterThanOrEqual(15); expect(bounds.height).toBeLessThanOrEqual(813);
  await page.screenshot({ path: '.test-artifacts/content-mobile.png' });
});


test('short brand form preserves entries after a failed save and keeps saved advanced rules', async ({ page }) => {
  let saves = 0;
  let brand: any = { revision: 2, data: { confirmed: [{ field: 'logoUsage', value: 'Dejar espacio alrededor.', source: 'merchant', evidence: 'Guía guardada.' }], suggested: [] } };
  const sourceRequests: string[] = [];
  await page.goto('/?demo=1');
  await page.route('**/api/v1/stores/s1/**', async route => {
    if (!route.request().url().endsWith('/brand')) { sourceRequests.push(route.request().url()); return route.fulfill({ json: {} }); }
    if (route.request().method() === 'PUT') {
      saves++;
      if (saves === 1) return route.fulfill({ status: 503, json: { message: 'No se pudo guardar. Inténtalo otra vez.' } });
      const value = route.request().postDataJSON();
      brand = { revision: 3, data: { confirmed: value.confirmed, suggested: value.suggested } };
    }
    return route.fulfill({ json: brand });
  });
  await page.evaluate(async () => {
    const { MerchantStudioApi } = await import('/src/api.ts');
    const { openBrandProfile } = await import('/src/brand-profile.ts');
    await openBrandProfile(new MerchantStudioApi(), 's1');
  });
  await expect(page.locator('[data-brand-field]:visible')).toHaveCount(3);
  await page.getByLabel('Qué hace única a tu marca').fill('Alfajores artesanales.');
  await page.getByLabel('A quién te diriges').fill('Familias de La Paz');
  await page.getByRole('button', { name: 'Guardar identidad' }).click();
  await expect(page.locator('dialog [role=status]')).toContainText('Inténtalo otra vez');
  await expect(page.getByLabel('Qué hace única a tu marca')).toHaveValue('Alfajores artesanales.');
  await expect(page.getByLabel('A quién te diriges')).toHaveValue('Familias de La Paz');
  await page.getByRole('button', { name: 'Guardar identidad' }).click();
  await expect(page.locator('dialog [role=status]')).toContainText('Identidad guardada');
  expect(brand.data.confirmed).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'positioning', value: 'Alfajores artesanales.' }),
    expect.objectContaining({ field: 'logoUsage', value: 'Dejar espacio alrededor.' }),
  ]));
  expect(sourceRequests).toEqual([]);
  await page.getByText('Importar una web, guía o imágenes', { exact: true }).click();
  await page.getByRole('button', { name: 'Analizar referencias' }).click();
  await expect(page.locator('dialog [role=status]')).toContainText('Añade una web');
  expect(saves).toBe(2);
  expect(sourceRequests).toEqual([]);
});
