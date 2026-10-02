import { finishedChatJob } from './source-chat-job-fixture';
import { expect, test, type Page } from '@playwright/test';

/**
 * G2 "Crecimiento" hands work to the Studio: a YAPI instruction lands in the composer (never sent), and a product opens
 * in the product guide at the step the insight is about. The dashboard is played by a same-origin host page that
 * embeds the Studio, exactly like the dashboard's iframe.
 */
const product = { id: 'p1', name: 'Lámpara Nube', description: 'Lámpara de mesa tejida a mano.', amount: 25000, currency: 'BOB', stock: 2, imageUrls: [], variants: [] };

async function mockApi(page: Page, sent: string[]) {
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if ((path.endsWith('/chat-jobs') && route.request().method() === 'POST')) sent.push(path);
    let body: unknown = {};
    if (path.endsWith('/stores')) body = [{ id: 's1', name: 'Casa Luz', slug: 'casa-luz' }];
    else if (path.endsWith('/source-project')) body = { revision: 0, versions: [], nextBefore: null };
    else if (path.endsWith('/conversation')) body = { messages: [], setup: { step: 'conversation', prompt: 'Cuéntame qué quieres crear.', options: [] } };
    else if (path.includes('fiscal') || path.includes('siat')) body = [];
    await route.fulfill({ json: finishedChatJob(body) });
  });
}
async function host(page: Page, src: string, script: string) {
  await page.route('**/__growth-host.html', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><iframe id="studio" src="${src}" style="width:1200px;height:900px;border:0"></iframe><script>${script}</script></body></html>` }));
  await page.goto('/__growth-host.html');
  return page.frameLocator('#studio');
}

test('a growth suggestion fills the YAPI composer, says so, and sends nothing', async ({ page }) => {
  const sent: string[] = [];
  await mockApi(page, sent);
  const text = 'Mejora el carrito de mi tienda para que más clientes continúen. No cambies precios ni productos.';
  const studio = await host(page, '/?source=1&embedded=1&store=s1', `
    window.received = [];
    addEventListener('message', event => {
      const frame = document.getElementById('studio').contentWindow;
      if (event.source !== frame) return;
      window.received.push(event.data.type);
      if (event.data.type === 'pagosya:studio-ready') frame.postMessage({ type: 'pagosya:studio-action', storeId: 's1', action: 'compose', origin: 'growth', text: ${JSON.stringify(text)} }, location.origin);
    });`);
  await expect(studio.getByRole('textbox', { name: 'Indicación para YAPI' })).toHaveValue(text);
  await expect(studio.getByRole('status').filter({ hasText: 'Sugerencia lista' })).toContainText('revísala y envíala cuando quieras');
  await expect.poll(() => page.evaluate(() => (window as unknown as { received: string[] }).received)).toContain('pagosya:studio-action-received');
  await page.waitForTimeout(400);
  expect(sent).toEqual([]);
});

test('an insight opens the product guide at the stock step of that product', async ({ page }) => {
  await mockApi(page, []);
  const studio = await host(page, '/?productGuide=1&store=s1', `
    addEventListener('message', event => {
      const frame = document.getElementById('studio').contentWindow;
      if (event.source === frame && event.data.type === 'pagosya:product-guide-ready') frame.postMessage({ type: 'pagosya:product-guide-edit', storeId: 's1', product: ${JSON.stringify(product)}, step: 'stock' }, location.origin);
    });`);
  await expect(studio.getByRole('heading', { name: 'Editar producto' })).toBeVisible();
  await expect(studio.locator('[data-product-step]')).toHaveText('Paso 7 de 8');
  await expect(studio.locator('input[name="stock"]')).toHaveValue('2');
  await expect(studio.locator('input[name="stock"]')).toBeFocused();
});

test('photos and description steps open where the insight points', async ({ page }) => {
  await mockApi(page, []);
  const studio = await host(page, '/?productGuide=1&store=s1', `
    let n = 0;
    addEventListener('message', event => {
      const frame = document.getElementById('studio').contentWindow;
      if (event.source === frame && event.data.type === 'pagosya:product-guide-ready' && !n++) frame.postMessage({ type: 'pagosya:product-guide-edit', storeId: 's1', product: ${JSON.stringify(product)}, step: 'photos' }, location.origin);
    });`);
  await expect(studio.locator('[data-product-step]')).toHaveText('Paso 5 de 8');
  await expect(studio.getByRole('heading', { name: 'Fotos del producto' })).toBeVisible();
});
