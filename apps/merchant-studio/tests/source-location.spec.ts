import { test, expect } from '@playwright/test';

const google = 'https://www.google.com/maps/embed?pb=!1m18!2d-68.1193!3d-16.5000&hl=es';
const osm = 'https://www.openstreetmap.org/export/embed.html?bbox=-68.2%2C-16.6%2C-68.1%2C-16.5&layer=mapnik';

test('legacy Google Maps embeds can navigate to the canonical provider', async ({ page }) => {
  // Use client navigation so Playwright intercepts both requests; HTTP redirect
  // chains only invoke its route handler for the first URL.
  await page.route('https://maps.google.com/maps?**', route => route.fulfill({ contentType: 'text/html', body: '<script>location.replace("https://www.google.com/maps?q=La%20Paz&output=embed")</script>' }));
  await page.route('https://www.google.com/maps?**', route => route.fulfill({ contentType: 'text/html', body: '<h1>La Paz</h1>' }));
  await page.goto('/');
  await page.evaluate(async () => {
    const { sourcePreviewDocument } = await import('/src/source-preview.ts');
    const frame = document.createElement('iframe'); frame.title = 'Redirect'; frame.sandbox.add('allow-scripts'); frame.style.height = '500px';
    frame.srcdoc = sourcePreviewDocument({ schemaVersion: 1, brief: {} as any, files: [{ path: 'index.html', content: '<iframe src="https://maps.google.com/maps?q=La%20Paz&amp;output=embed"></iframe>' }] });
    document.body.replaceChildren(frame);
  });
  await expect(page.frameLocator('iframe[title="Redirect"]').frameLocator('iframe').getByRole('heading', { name: 'La Paz' })).toBeVisible();
});

for (const hosted of [false, true]) test(`location embeds load with sandbox isolation (${hosted ? 'hosted' : 'editor'})`, async ({ page }) => {
  const loaded: string[] = [];
  await page.route(/https:\/\/(www\.google\.com|www\.openstreetmap\.org)\//, async route => {
    loaded.push(route.request().url());
    await route.fulfill({ contentType: 'text/html', body: '<button onclick="this.textContent=\'Mapa ampliado\'">Ampliar mapa</button>' });
  });
  await page.goto('/');
  await page.evaluate(async ({ google, osm, hosted }) => {
    const { sourcePreviewDocument } = await import('/src/source-preview.ts');
    const frame = document.createElement('iframe');
    frame.title = 'Location test'; frame.sandbox.add('allow-scripts');
    frame.style.cssText = 'display:block;width:100%;height:900px;border:0';
    frame.srcdoc = sourcePreviewDocument({ schemaVersion: 1, brief: {} as any, files: [{ path: 'index.html', content: `
      <h1>Visítanos</h1><section data-pagosya-contact hidden></section>
      <iframe id="google" title="Sucursal central" src="${google.replaceAll('&', '&amp;')}" width="900" height="450" style="width:900px" srcdoc="<h1>Injected</h1>" onload="window.injected=true" allow="camera; microphone" sandbox="allow-scripts allow-same-origin allow-top-navigation"></iframe>
      <iframe id="osm" src="${osm.replaceAll('&', '&amp;')}"></iframe>
      <iframe src="https://example.com/"></iframe><iframe srcdoc="Bad"></iframe>
      <iframe src="https://www.google.com.evil.test/maps/embed"></iframe>` }] }, 'index.html', { hosted });
    document.body.replaceChildren(frame);
  }, { google, osm, hosted });
  const outer = page.frameLocator('iframe[title="Location test"]');
  await expect(outer.locator('iframe')).toHaveCount(2);
  const map = outer.locator('#google');
  await expect(map).toHaveAttribute('src', google);
  await expect(map).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(map).not.toHaveAttribute('srcdoc');
  await expect(map).not.toHaveAttribute('onload');
  await expect(map).not.toHaveAttribute('allow');
  await expect(outer.locator('#osm')).toHaveAttribute('title', 'Ubicación del negocio');
  await expect(map).toBeVisible();
  await map.scrollIntoViewIfNeeded();
  await outer.frameLocator('#google').getByRole('button', { name: 'Ampliar mapa' }).click();
  await expect(outer.frameLocator('#google').getByRole('button')).toHaveText('Mapa ampliado');
  await outer.locator('#osm').scrollIntoViewIfNeeded();
  await expect(outer.frameLocator('#osm').getByRole('button')).toBeVisible();
  expect(loaded).toEqual(expect.arrayContaining([google, osm]));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await outer.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(await outer.locator('body').evaluate(() => { try { void parent.document; return false; } catch { return true; } })).toBe(true);
});

test('only map embed endpoints pass validation and documents without maps retain frame-src none', async ({ page }) => {
  await page.goto('/');
  const rejected = ['https://maps.app.goo.gl/place', 'https://www.google.com/maps/place/Cafe', 'https://www.google.com/maps?output=html', 'https://evil.test/maps/embed', 'https://www.google.com.evil.test/maps/embed', 'https://www.google.com@evil.test/maps/embed', 'https://user:pass@www.google.com/maps/embed', 'http://www.google.com/maps/embed', 'https://www.google.com:8443/maps/embed', 'javascript:alert(1)', 'data:text/html,test', '//www.google.com/maps/embed', 'https://www.openstreetmap.org/user/test'];
  const accepted = [google, osm, 'https://maps.google.com/maps?q=La%20Paz&output=embed', 'https://www.google.com/maps?output=embed&q=La%20Paz', 'https://www.google.com/maps/d/u/0/embed?mid=provided-id', 'https://www.google.com/maps/embed/v1/place?key=provided-key&q=La%20Paz'];
  const result = await page.evaluate(async ({ rejected, accepted }) => {
    const { sourceLocationUrl } = await import('/src/source-location.ts');
    const { sourcePreviewDocument } = await import('/src/source-preview.ts');
    return { rejected: rejected.map(sourceLocationUrl), accepted: accepted.map(sourceLocationUrl), empty: sourcePreviewDocument({ schemaVersion: 1, brief: {} as any, files: [{ path: 'index.html', content: '<h1>Store</h1><iframe src="https://evil.test"></iframe>' }] }) };
  }, { rejected, accepted });
  expect(result.rejected).toEqual(rejected.map(() => null));
  expect(result.accepted).toEqual(accepted);
  expect(result.empty).toContain("frame-src 'none'");
  expect(result.empty).not.toContain('<iframe');
});
