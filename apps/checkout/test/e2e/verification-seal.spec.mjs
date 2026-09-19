import { createRequire } from 'node:module';

const { test, expect } = createRequire(new URL('../../../merchant-studio/package.json', import.meta.url))('@playwright/test');

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`the verified seal is platform chrome outside the store frame and leads to the pagosYa page (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('https://www.openstreetmap.org/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Mapa</p>' }));
    await page.goto('http://127.0.0.1:4517/s/seguridad');
    const seal = page.locator('body > a.pagosya-seal');
    await expect(seal).toBeVisible();
    await expect(seal).toHaveAttribute('href', 'http://127.0.0.1:4517/verificar/seguridad');
    // The generated design lives in an opaque frame and has no handle on the seal.
    expect(await page.frameLocator('#app > iframe').locator('.pagosya-seal').count()).toBe(0);
    await page.screenshot({ path: `../../test-results/verification-seal-${viewport.width}.png` });
    await page.goto('http://127.0.0.1:4517/verificar/seguridad');
    await expect(page.getByText('Comercio verificado por pagosYa')).toBeVisible();
    await expect(page.getByText('Emite factura electrónica')).toBeVisible();
    await page.screenshot({ path: `../../test-results/verification-page-${viewport.width}.png` });
  });
}
