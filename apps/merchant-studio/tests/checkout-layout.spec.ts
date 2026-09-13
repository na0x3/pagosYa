import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const commerce = readFileSync(new URL('../../api/src/stores/source-kit/commerce.js', import.meta.url), 'utf8');
const retention = readFileSync(new URL('../../api/src/stores/source-kit/retention.js', import.meta.url), 'utf8');

for (const saved of [null, 'http://localhost:5199']) test(`Studio uses ${saved ? 'the configured checkout server' : 'the development checkout port'}`, async ({ page }) => {
  if (saved) await page.addInitScript(value => sessionStorage.setItem('pagosya_checkout_origin', value), saved);
  await page.goto('/?demo=1');
  const origin = await page.evaluate(async () => (await import('/src/api.ts')).CHECKOUT_ORIGIN);
  expect(origin).toBe(saved || 'http://localhost:5175');
});

for (const width of [1440, 1024, 390]) test(`checkout stays inside its authored column at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/?demo=1');
  await page.evaluate(async ({ commerce, retention }) => {
    const { sourcePreviewDocument } = await import('/src/source-preview.ts');
    const snapshot = { schemaVersion: 1, brief: { businessType: 'Panadería', audience: 'Clientes', primaryAction: 'Comprar', visualDirection: 'Editorial' }, files: [
      { path: 'checkout.html', content: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
        body{margin:0;font:16px/1.5 system-ui;--paper:#f1ecdf;--ink:#223528;--accent:#387845;background:var(--paper);color:var(--ink)}
        main{display:grid;grid-template-columns:38% 62%}.intro{padding:48px;background:var(--accent);color:white}.intro h1{font:48px Georgia,serif}
        [data-pagosya-cart]{position:fixed;top:0;right:0;width:560px;height:100vh;padding:40px;z-index:99;background:white;box-shadow:-12px 0 48px #0003;overflow:auto}
        @media(max-width:700px){main{grid-template-columns:1fr}.intro{padding:24px}.intro h1{font-size:32px}}
        </style><script src="config.js" defer></script><script src="commerce.js" defer></script></head><body><main><section class="intro"><h1>Completar el pedido.</h1></section><div data-pagosya-checkout-page></div></main></body></html>` },
      { path: 'config.js', content: 'window.PAGOSYA_CONFIG=' + JSON.stringify({ slug: 'checkout-layout', data: { storeName: 'Panadería', checkoutMode: 'payment', locations: [], categories: [], items: [{ id: 'pan', name: 'Pan', amount: 20000, currency: 'BOB', imageUrls: [] }], retention: { recoveryEnabled: true } } }) + ';' },
      { path: 'commerce.js', content: commerce + '\n' + retention },
    ] };
    document.body.innerHTML = ''; document.body.style.margin = '0';
    const frame = document.createElement('iframe'); frame.title = 'Checkout'; frame.sandbox.add('allow-scripts'); frame.style.cssText = 'width:100%;height:100vh;border:0';
    frame.srcdoc = sourcePreviewDocument(snapshot, 'checkout.html', { cart: [{ id: 'pan', quantity: 1 }] }); document.body.append(frame);
  }, { commerce, retention });
  const frame = page.frameLocator('iframe'); const review = frame.locator('[data-checkout-review]');
  await expect(frame.getByRole('button', { name: 'Continuar al pago de prueba' })).toBeVisible();
  await expect(review).toHaveCSS('position', 'static');
  await expect(frame.getByRole('heading', { name: 'Continúa al pago', exact: true })).toBeVisible();
  await expect(frame.getByRole('heading', { name: '¿Cómo quieres recibir tu pedido?' })).toHaveCount(0);
  const layout = await review.evaluate(el => {
    const bounds = el.getBoundingClientRect(), host = el.closest('[data-pagosya-checkout]')!.getBoundingClientRect();
    const fields = el.querySelector('.checkout-review__fields')!.getBoundingClientRect(), summary = el.querySelector('.checkout-review__summary')!.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, hostLeft: host.left, hostRight: host.right, fieldsBottom: fields.bottom, fieldsRight: fields.right, summaryTop: summary.top, summaryLeft: summary.left, contentWidth: el.closest('.checkout-page__inner')!.getBoundingClientRect().width, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(layout.left).toBeGreaterThanOrEqual(layout.hostLeft); expect(layout.right).toBeLessThanOrEqual(layout.hostRight);
  if (layout.contentWidth <= 700) expect(layout.summaryTop).toBeGreaterThanOrEqual(layout.fieldsBottom);
  else expect(layout.summaryLeft).toBeGreaterThanOrEqual(layout.fieldsRight);
  expect(layout.overflow).toBe(false);
  const recovery = frame.locator('[data-retention-recovery]'); await expect(recovery).toBeVisible();
  const checkbox = await recovery.getByRole('checkbox').boundingBox(); expect(checkbox!.width).toBeLessThanOrEqual(24); expect(checkbox!.height).toBeLessThanOrEqual(24);
  const button = await frame.getByRole('button', { name: 'Continuar al pago de prueba' }).boundingBox(); expect(button!.width).toBeGreaterThan(200);
  await page.screenshot({ path: `.test-artifacts/checkout-layout-${width}.png`, fullPage: true });
  await frame.getByRole('button', { name: 'Añadir una unidad de Pan' }).click(); await expect(review.locator('output')).toHaveText('2');
  await frame.getByRole('button', { name: 'Continuar al pago de prueba' }).click();
  await expect(frame.getByRole('heading', { name: 'Pago de prueba', exact: true })).toBeVisible(); await expect(review).toHaveCSS('position', 'static');
});
