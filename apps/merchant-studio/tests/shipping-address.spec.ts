import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const kit = (name: string) => readFileSync(new URL(`../../api/src/stores/source-kit/${name}`, import.meta.url), 'utf8');
// Demo catalog only. Nothing is written to a merchant store; every API call is answered here.
const cookie = { id: 'cookie', name: 'Galleta', amount: 10000, currency: 'BOB', stock: 10, imageUrls: [] };
const origin = 'http://localhost:4999';
const quote = { amount: 12500, subtotal: 10000, discountAmount: 0, shippingAmount: 2500, currency: 'BOB', shippingOptions: [{ id: 'z1', name: 'Servientrega · Santa Cruz', amount: 2500, currency: 'BOB', carrierId: 'car_servientrega' }] };
// A tiny stand-in for Leaflet so the test does not depend on the CDN and can see how the map is built.
const leafletStub = `window.L = { map(box) { const m = { setView(c, z) { window.__map = { center: c, zoom: z }; return m; }, on(e, f) { window.__mapClick = f; return m; } }; return m; },
  tileLayer(url) { return { addTo() { window.__tiles = url; } }; },
  marker(c, o) { const k = { at: c, setLatLng(p) { k.at = p; window.__marker = k; }, getLatLng() { return { lat: k.at[0], lng: k.at[1] }; }, on(e, f) { k.drag = f; return k; }, addTo() { window.__marker = k; return k; } }; window.__markerOptions = o; return k; } };`;

async function open(page: Page, data: Record<string, unknown>, { leaflet = true } = {}) {
  const store = { storeName: 'Prueba', shippingEnabled: true, shippingPickupEnabled: true, items: [cookie], ...data };
  const bodies: Record<string, any>[] = [], checkouts: Record<string, any>[] = [];
  await page.route('https://cdnjs.cloudflare.com/**', route => leaflet
    ? route.fulfill({ contentType: route.request().url().endsWith('.js') ? 'text/javascript' : 'text/css', body: route.request().url().endsWith('.js') ? leafletStub : '' })
    : route.abort());
  await page.route('https://*.tile.openstreetmap.org/**', route => route.fulfill({ status: 204 }));
  await page.route(`${origin}/api/**`, async route => {
    const url = route.request().url();
    if (url.endsWith('/stores/public/kit/store')) return route.fulfill({ json: store });
    if (url.includes('/stores/public/kit/content')) return route.fulfill({ json: { articles: [], reviews: [], bundles: [] } });
    if (url.endsWith('/stores/public/kit/shipping/quote')) {
      const body = route.request().postDataJSON(); bodies.push(body);
      // Like the API's DTO: a destination without city/street/recipient is a 400.
      const d = body.shippingDestination;
      if (d && !(d.city && d.street && d.recipientName && d.recipientPhone)) return route.fulfill({ status: 400, json: { message: ['Escribe la ciudad.'] } });
      return route.fulfill({ json: quote });
    }
    // Answer checkout with an error so the page stays put after the payload is captured.
    if (url.endsWith('/stores/public/kit/cart-checkout')) { checkouts.push(route.request().postDataJSON()); return route.fulfill({ status: 400, json: { message: 'Pedido de prueba recibido.' } }); }
    return route.fulfill({ status: 404, json: { message: 'No encontrado' } });
  });
  await page.route(`${origin}/product.html**`, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${kit('commerce-pages.css')}body{margin:0;font-family:Arial,sans-serif}</style></head><body class="commerce-document"><header class="commerce-header"><a href="index.html" data-store-name>Prueba</a><nav aria-label="Tienda"><button data-cart-open>Mi pedido (<span data-cart-count>0</span>)</button></nav></header><main data-pagosya-product-page></main><div data-pagosya-cart hidden></div><p data-pagosya-status></p><script>window.PAGOSYA_CONFIG=${JSON.stringify({ slug: 'kit', apiBaseUrl: `${origin}/api`, checkoutOrigin: origin, productPage: 'product.html' })}</script><script>${kit('commerce.js')}</script></body></html>` }));
  await page.goto(`${origin}/product.html?id=cookie`);
  await expect(page.locator('#pagosya-product-title')).toBeVisible();
  await page.locator('.product-detail__buy').click();
  await page.locator('[data-cart-open]').first().click();
  await page.getByRole('button', { name: 'Continuar con mi pedido' }).first().click();
  await page.getByRole('combobox', { name: 'Entrega', exact: true }).selectOption('delivery');
  return Object.assign(bodies, { checkouts });
}

test('carrier stores collect a structured Bolivian address and a map pin', async ({ page }) => {
  const bodies = await open(page, { shippingCarriersEnabled: true });
  await expect(page.getByLabel('Departamento')).toBeVisible();
  // The free-text address is replaced, not duplicated.
  await expect(page.getByLabel('Dirección', { exact: true })).toHaveCount(0);
  await page.getByLabel('Departamento').selectOption('SANTA_CRUZ');
  await page.getByLabel('Ciudad').fill('Santa Cruz');
  await page.getByLabel('Calle y número').fill('Av. Busch 55');
  await page.getByLabel('Referencias').fill('Portón verde');
  await page.getByLabel('Nombre de quien recibe').fill('Ana Quispe');
  await page.getByLabel('Teléfono de quien recibe').fill('71234567');
  await expect(page.getByLabel('Teléfono de quien recibe')).toHaveAttribute('inputmode', 'tel');
  await expect.poll(() => page.evaluate(() => (window as any).__markerOptions)).toMatchObject({ draggable: true, keyboard: true });
  expect(await page.evaluate(() => (window as any).__tiles)).toBe('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
  // Without a pin the order cannot go ahead.
  await page.getByRole('button', { name: 'Pagar con pagosYa' }).click();
  await expect(page.locator('[data-pagosya-checkout-status]')).toHaveText('Marca tu puerta en el mapa.');
  expect(bodies.checkouts).toHaveLength(0);
  // A pin outside Bolivia is refused and explained.
  expect(await page.evaluate(() => (window as any).__pagosyaSetPin(-34.6, -58.38))).toBe(false);
  await expect(page.locator('[data-pin-status]')).toHaveText('La ubicación debe estar dentro de Bolivia.');
  expect(await page.evaluate(() => (window as any).__pagosyaSetPin(-17.78, -63.18))).toBe(true);
  await expect(page.locator('[data-pin-status]')).toHaveText('Ubicación marcada.');
  await page.getByRole('button', { name: 'Calcular envío' }).click();
  await expect.poll(() => bodies.at(-1)?.shippingDestination).toMatchObject({ department: 'SANTA_CRUZ', city: 'Santa Cruz', street: 'Av. Busch 55', references: 'Portón verde', lat: -17.78, lng: -63.18, recipientName: 'Ana Quispe', recipientPhone: '71234567' });
  expect(typeof bodies.at(-1)?.shippingDestination.lat).toBe('number');
  await expect(page.getByLabel('Opción de envío')).toContainText('Servientrega · Santa Cruz');
  await page.getByLabel('Opción de envío').selectOption('z1');
  await page.getByRole('button', { name: 'Pagar con pagosYa' }).click();
  await expect.poll(() => bodies.checkouts.length).toBe(1);
  expect(bodies.checkouts[0]).toMatchObject({ fulfillmentMethod: 'delivery', shippingZoneId: 'z1', shippingAddress: 'Av. Busch 55, Santa Cruz', shippingDestination: { department: 'SANTA_CRUZ', lat: -17.78, lng: -63.18, recipientName: 'Ana Quispe' } });
});

test('pinning first never sends a partial destination', async ({ page }) => {
  const bodies = await open(page, { shippingCarriersEnabled: true });
  await expect(page.getByLabel('Departamento')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__pagosyaSetPin(-17.78, -63.18))).toBe(true);
  await page.getByLabel('Departamento').selectOption('SANTA_CRUZ');
  await page.getByLabel('Ciudad').fill('Santa Cruz');
  await page.getByLabel('Calle y número').fill('Av. Busch 55');
  await page.getByLabel('Nombre de quien recibe').fill('Ana Quispe');
  await page.getByLabel('Teléfono de quien recibe').fill('71234567');
  await page.getByRole('button', { name: 'Calcular envío' }).click();
  await expect(page.getByLabel('Opción de envío')).toContainText('Servientrega · Santa Cruz');
  const sent = bodies.filter(body => body.shippingDestination);
  expect(sent).toHaveLength(1);
  expect(sent[0].shippingDestination).toEqual({ department: 'SANTA_CRUZ', city: 'Santa Cruz', street: 'Av. Busch 55', lat: -17.78, lng: -63.18, recipientName: 'Ana Quispe', recipientPhone: '71234567' });
  // Changing the department of a complete destination re-quotes with it.
  await page.getByLabel('Departamento').selectOption('COCHABAMBA');
  await expect.poll(() => bodies.filter(body => body.shippingDestination).at(-1)?.shippingDestination.department).toBe('COCHABAMBA');
});

test('the address and "Usar mi ubicación" keep working when the map cannot load', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -16.5, longitude: -68.15 });
  const bodies = await open(page, { shippingCarriersEnabled: true }, { leaflet: false });
  await expect(page.locator('[data-pin-status]')).toContainText('No se pudo cargar el mapa.');
  await page.getByLabel('Departamento').selectOption('LA_PAZ');
  await page.getByLabel('Ciudad').fill('La Paz');
  await page.getByLabel('Calle y número').fill('Calle 21 de Calacoto 8');
  await page.getByLabel('Nombre de quien recibe').fill('Luis Mamani');
  await page.getByLabel('Teléfono de quien recibe').fill('76543210');
  await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
  await expect(page.locator('[data-pin-status]')).toHaveText('Ubicación marcada.');
  await page.getByRole('button', { name: 'Calcular envío' }).click();
  await expect.poll(() => bodies.at(-1)?.shippingDestination).toMatchObject({ department: 'LA_PAZ', lat: -16.5, lng: -68.15 });
  expect(bodies.at(-1)?.shippingDestination.references).toBeUndefined();
});

test('stores without carriers keep the single address field', async ({ page }) => {
  const bodies = await open(page, { shippingCarriersEnabled: false });
  await expect(page.getByLabel('Departamento')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Usar mi ubicación' })).toHaveCount(0);
  await page.getByLabel('Dirección', { exact: true }).fill('Av. Busch 55');
  await page.getByRole('button', { name: 'Calcular envío' }).click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).not.toHaveProperty('shippingDestination');
  await page.getByLabel('Opción de envío').selectOption('z1');
  await page.getByRole('button', { name: 'Pagar con pagosYa' }).click();
  await expect.poll(() => bodies.checkouts.length).toBe(1);
  expect(bodies.checkouts[0]).toMatchObject({ shippingAddress: 'Av. Busch 55', shippingZoneId: 'z1' });
  expect(bodies.checkouts[0]).not.toHaveProperty('shippingDestination');
  expect(await page.evaluate(() => typeof (window as any).__pagosyaSetPin)).toBe('undefined');
});

test('at 390px the address fieldset and map container fit without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { shippingCarriersEnabled: true });
  const fieldset = page.locator('[data-shipping-destination]');
  const map = page.locator('[data-shipping-map]');
  await expect(fieldset).toBeVisible();
  await expect(map).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const [fieldsetBox, mapBox, viewportWidth] = await Promise.all([
    fieldset.evaluate((el) => el.getBoundingClientRect().right),
    map.evaluate((el) => el.getBoundingClientRect().right),
    page.evaluate(() => document.documentElement.clientWidth),
  ]);
  expect(fieldsetBox).toBeLessThanOrEqual(viewportWidth + 1);
  expect(mapBox).toBeLessThanOrEqual(viewportWidth + 1);
});
