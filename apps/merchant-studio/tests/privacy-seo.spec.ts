import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const kit = (name: string) => readFileSync(new URL(`../../api/src/stores/source-kit/${name}`, import.meta.url), 'utf8');

test('hosted visitors opt in before attribution, can revoke it, and retain checkout and product navigation', async ({ page }) => {
  const slug = 'privacy-seo-test';
  const store = { storeName: 'Café Origen', items: [{ id: 'p1', name: 'Café Yungas', amount: 1800, currency: 'BOB', stock: 5 }], categories: [], locations: [] };
  const snapshot = { schemaVersion: 1, brief: {}, files: [
    { path: 'index.html', content: '<html><head></head><body><h1>Café Origen</h1><div data-pagosya-catalog></div><div data-pagosya-cart></div><p data-pagosya-status></p><script src="config.js"></script><script src="commerce.js"></script></body></html>' },
    ...['product.html', 'checkout.html', 'commerce-pages.css'].map(path => ({ path, content: kit(path) })),
    { path: 'commerce.js', content: kit('privacy.js') + '\n' + kit('commerce.js') },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG=' + JSON.stringify({ slug, data: store, productPage: 'product.html', checkoutPage: 'checkout.html' }) + ';' },
  ] };
  const visitors: Array<string | null> = []; let checkout: any;
  await page.route(`**/stores/public/${slug}/**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/source-site')) { visitors.push(url.searchParams.get('visitorId')); return route.fulfill({ json: { published: true, analyticsAvailable: true, snapshot, visitToken: 'visit-test' } }); }
    if (url.pathname.endsWith('/seo')) return route.fulfill({ json: { head: '<title>Café Yungas · Café Origen</title><link rel="canonical" href="https://cafe.test/p/p1"><meta name="robots" content="index, follow">' } });
    if (url.pathname.endsWith('/cart-checkout')) { checkout = route.request().postDataJSON(); return route.fulfill({ json: { clientSecret: 'test-secret' } }); }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/?demo=1');
  const modulePath = '/@fs' + new URL('../../checkout/src/source-storefront.ts', import.meta.url).pathname;
  const mount = () => page.evaluate(async ({ modulePath, slug, store }) => {
    const { mountPublishedSource } = await import(modulePath);
    document.body.innerHTML = '<div id="shop"></div>'; document.body.style.cssText = 'margin:0;background:#fffdf8;color:#25271e;font:16px system-ui';
    history.replaceState({}, '', '/s/' + slug);
    await mountPublishedSource(document.querySelector('#shop'), slug, store, async () => { document.querySelector('#shop')!.textContent = 'Pago listo'; });
  }, { modulePath, slug, store });
  await mount(); expect(visitors).toEqual([null]);
  await expect(page.getByRole('heading', { name: 'Tu privacidad, tu elección' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.test-artifacts/privacy-mobile.png' });
  expect(await page.locator('[data-privacy-panel]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Permitir estadísticas', exact: true }).click();
  await mount(); expect(visitors[1]).toMatch(/^[a-f0-9-]{36}$/);
  await page.getByRole('button', { name: 'Privacidad y cookies', exact: true }).click();
  await page.getByRole('button', { name: 'Solo necesarias', exact: true }).click();
  const frame = page.frameLocator('iframe');
  await frame.getByRole('link', { name: 'Ver detalle de Café Yungas' }).click();
  await expect(page).toHaveURL(/\/p\/p1$/); await expect(page).toHaveTitle('Café Yungas · Café Origen');
  await frame.getByRole('button', { name: 'Añadir al pedido', exact: true }).click();
  await frame.getByRole('button', { name: 'Continuar con mi pedido', exact: true }).click();
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, nofollow');
  await frame.getByRole('button', { name: 'Pagar con pagosYa' }).click();
  await expect(page.getByText('Pago listo')).toBeVisible();
  expect(checkout.sourceVisitToken).toBeUndefined(); expect(checkout.items).toHaveLength(1);
  await mount(); expect(visitors[2]).toBeNull();
});
