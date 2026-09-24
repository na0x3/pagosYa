import { createRequire } from 'node:module';

// Use the existing workspace test runner without adding production dependencies.
const { test, expect } = createRequire(new URL('../../../merchant-studio/package.json', import.meta.url))('@playwright/test');
const attacker = 'https://exfiltracion.example';
const mapUrl = 'https://www.openstreetmap.org/export/embed.html?bbox=-68.2,-16.6,-68.1,-16.5';

for (const [name, url] of [
  ['hosted slug', 'http://127.0.0.1:4517/s/seguridad'],
  ['custom domain', 'http://tienda.localhost:4517/'],
]) {
  test(`${name}: generated source cannot send typed input by navigating its frame`, async ({ page }) => {
    const dispatched = [];
    const navigated = [];
    const violations = [];
    // Record requests that actually get past CSP; fulfill locally so the red
    // test proves the leak without transmitting even fixture data externally.
    await page.route(`${attacker}/**`, async route => {
      dispatched.push(route.request().url());
      await route.fulfill({ contentType: 'text/html', body: '<h1>Destino externo</h1>' });
    });
    await page.route('https://www.openstreetmap.org/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Mapa de prueba</p>' }));
    page.on('framenavigated', frame => navigated.push(frame.url()));
    await page.exposeFunction('recordViolation', event => violations.push(event));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', event => {
        window.recordViolation({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
      });
    });
    const response = await page.goto(url);
    expect(response.status()).toBe(200);
    const source = page.frameLocator('#app > iframe');
    await expect(source.getByLabel('Dirección de entrega')).toBeVisible();
    expect(await page.locator('#app > iframe').getAttribute('sandbox')).not.toContain('allow-same-origin');
    await source.getByLabel('Dirección de entrega').fill('Calle de prueba 123');
    // Wait for an observed outcome, not an arbitrary delay or a missing script.
    await expect.poll(() => dispatched.length + violations.filter(event => event.blockedURI.startsWith(attacker)).length).toBeGreaterThan(0);
    expect(dispatched).toEqual([]);
    expect(navigated.filter(destination => destination.startsWith(attacker))).toEqual([]);
    expect(violations).toContainEqual({ directive: 'frame-src', blockedURI: attacker });
  });

  test(`${name}: approved map iframe still loads inside the opaque source frame`, async ({ page }) => {
    const loaded = [];
    await page.route(mapUrl, async route => {
      loaded.push(route.request().url());
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="es"><p>Mapa de prueba cargado</p></html>' });
    });
    expect((await page.goto(url)).status()).toBe(200);
    await expect(page.frameLocator('#app > iframe').frameLocator('iframe').getByText('Mapa de prueba cargado')).toBeVisible();
    expect(loaded).toEqual([mapUrl]);
    expect(page.frames().some(frame => frame.url() === mapUrl)).toBe(true);
  });
}
