import { createRequire } from 'node:module';

const { test, expect } = createRequire(new URL('../../../merchant-studio/package.json', import.meta.url))('@playwright/test');

test('hosted designs load platform uploads directly and still cannot load images from other hosts', async ({ page }) => {
  const external = [];
  await page.route('https://exfiltracion.example/**', route => { external.push(route.request().url()); return route.fulfill({ contentType: 'image/png', body: '' }); });
  await page.route('https://www.openstreetmap.org/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Mapa</p>' }));
  await page.goto('http://127.0.0.1:4517/s/seguridad');
  const frame = page.frameLocator('#app > iframe');
  await expect.poll(() => frame.locator('#foto-plataforma').evaluate(img => img.complete && img.naturalWidth)).toBe(1);
  expect(await frame.locator('#foto-externa').getAttribute('src')).toBeNull();
  expect(external).toEqual([]);
});
