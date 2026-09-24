import { createRequire } from 'node:module';

const { test, expect } = createRequire(new URL('../../../merchant-studio/package.json', import.meta.url))('@playwright/test');

test('a published design opens the merchant-configured Instagram link and ignores unknown destinations', async ({ page, context }) => {
  await context.route('https://instagram.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Perfil</h1>' }));
  const unknown = [];
  await context.route('https://desconocido.example/**', route => { unknown.push(route.request().url()); return route.fulfill({ contentType: 'text/html', body: 'x' }); });
  await page.route('https://www.openstreetmap.org/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Mapa</p>' }));
  await page.goto('http://127.0.0.1:4517/s/seguridad');
  const frame = page.frameLocator('#app > iframe');
  const [popup] = await Promise.all([context.waitForEvent('page'), frame.locator('#instagram').click()]);
  await popup.waitForLoadState();
  expect(popup.url()).toBe('https://instagram.com/tienda-prueba');
  await frame.locator('#desconocido').click();
  await page.waitForTimeout(400);
  expect(unknown).toEqual([]);
  expect(page.url()).toBe('http://127.0.0.1:4517/s/seguridad');
});
