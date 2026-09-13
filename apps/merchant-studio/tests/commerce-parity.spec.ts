import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('merchant issues credit, preserves failed submissions and uploads private files on mobile', async ({ page }) => {
  let fail = true, issued: any, upload = false; const credits: any[] = []; const files: any[] = []; const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname; let json: any = {};
    if (path.endsWith('/stores')) json = [{ id: 's1', slug: 'digital', name: 'Digital' }];
    else if (path.endsWith('/source-project')) json = { revision: 0, versions: [], nextBefore: null };
    else if (path.endsWith('/conversation')) json = { messages: [] };
    else if (path.endsWith('/commerce')) json = { credits, files, products: [{ id: 'p1', name: 'Guía digital' }] };
    else if (path.endsWith('/credits')) {
      if (fail) { fail = false; return route.fulfill({ status: 503, json: { message: 'Reintenta la emisión.' } }); }
      issued = route.request().postDataJSON(); credits.push({ id: 'c1', ...issued, balance: issued.amount, active: true }); json = { id: 'c1', code: 'ABCD1234-ABCD1234-ABCD1234-ABCD1234', balance: issued.amount, currency: 'BOB' };
    } else if (path.endsWith('/products/p1/files')) { upload = true; files.push({ id: 'f1', productId: 'p1', filename: 'guide.pdf', byteSize: 25, active: true }); json = files[0]; }
    await route.fulfill({ json });
  });
  await page.goto('/?source=1');
  await page.locator('.source-store-menu > summary').click();
  await page.getByRole('button', { name: 'Tarjetas de regalo y saldos', exact: true }).click();
  await expect(page.getByLabel('Archivo privado')).toBeHidden();
  await page.getByLabel('Referencia o destinatario').fill('Para Ana'); await page.getByLabel('Importe', { exact: true }).fill('50');
  await page.getByRole('button', { name: 'Emitir código de saldo' }).click();
  await expect(page.getByText('Reintenta la emisión.')).toBeVisible(); await expect(page.getByLabel('Referencia o destinatario')).toHaveValue('Para Ana');
  await page.getByRole('button', { name: 'Emitir código de saldo' }).click();
  await expect(page.getByText('ABCD1234-ABCD1234-ABCD1234-ABCD1234')).toBeVisible(); expect(issued.amount).toBe(5000);
  await page.screenshot({ path: '.test-artifacts/commerce-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.locator('.source-store-menu > summary').click();
  await page.getByRole('button', { name: 'Archivos digitales', exact: true }).click();
  await expect(page.getByLabel('Importe', { exact: true })).toBeHidden();
  await page.getByLabel('Archivo privado').setInputFiles({ name: 'guide.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 guide') });
  await page.getByRole('button', { name: 'Añadir archivo digital' }).click();
  await expect(page.getByText('Archivo añadido. El producto se entrega por descarga.')).toBeVisible(); expect(upload).toBe(true);
  await expect(page.getByRole('button', { name: 'Pausar archivo' })).toBeVisible();
  await page.locator('dialog').evaluate(el => el.scrollTop = 0); await page.screenshot({ path: '.test-artifacts/commerce-mobile.png' });
  expect(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true); expect(errors).toEqual([]);
});

test('exported digital checkout applies credit and omits physical delivery', async ({ page }) => {
  const runtime = readFileSync(new URL('../../api/src/stores/source-kit/commerce.js', import.meta.url), 'utf8');
  let payload: any; const code = 'ABCD1234-ABCD1234-ABCD1234-ABCD1234';
  const store = { storeName: 'Digital', checkoutMode: 'payment', creditsEnabled: true, shippingEnabled: true, locations: [{ id: 'branch', name: 'Local', pickupEnabled: true }], items: [{ id: 'p1', name: 'Guía', fulfillmentType: 'DIGITAL', amount: 10000, currency: 'BOB', stock: null, imageUrls: [] }], categories: [] };
  await page.goto('/?demo=1');
  await page.route('https://commerce.example/v1/**', async route => {
    if (route.request().url().endsWith('/store')) return route.fulfill({ json: store });
    if (route.request().url().endsWith('/shipping/quote')) return route.fulfill({ json: { subtotal: 10000, discountAmount: 0, shippingAmount: 0, creditAmount: 10000, amount: 0, currency: 'BOB', shippingOptions: [] } });
    payload = route.request().postDataJSON(); return route.fulfill({ status: 400, json: { message: 'Prueba sin cobro.' } });
  });
  await page.setContent('<main><div data-pagosya-catalog></div><div data-pagosya-cart></div><p data-pagosya-status></p></main>');
  await page.addScriptTag({ content: `window.PAGOSYA_CONFIG=${JSON.stringify({ slug: 'digital', apiBaseUrl: 'https://commerce.example/v1', checkoutOrigin: 'https://checkout.example', data: store })};` });
  await page.addScriptTag({ content: runtime });
  await page.getByRole('button', { name: 'Añadir Guía', exact: true }).click(); await page.getByRole('button', { name: 'Continuar con mi pedido' }).click();
  const review = page.locator('[data-checkout-review]');
  await expect(review.getByLabel('Sucursal')).toHaveCount(0); await expect(review.getByLabel('Dirección')).toHaveCount(0);
  await review.getByLabel('Tarjeta de regalo o saldo').fill(code); await review.getByRole('button', { name: 'Aplicar saldo' }).click();
  await expect(review.locator('[data-credit-status]')).toContainText(/Restante a pagar: Bs\s*0,00/);
  await review.getByRole('button', { name: 'Pagar con pagosYa' }).click(); await expect.poll(() => payload).toBeTruthy();
  expect(payload.creditCode).toBe(code); expect(payload.locationId).toBeUndefined(); expect(payload.fulfillmentMethod).toBeUndefined();
});

test('standard checkout requires applying an edited credit code and refreshes download links', async ({ page }) => {
  await page.goto('/?demo=1');
  let quotes = 0; let downloads = 0;
  await page.route('**/stores/public/test/shipping/quote', async route => { quotes++; const body = route.request().postDataJSON(); await route.fulfill({ json: { subtotal: 10000, discountAmount: 0, shippingAmount: 0, creditAmount: body.creditCode ? 10000 : 0, amount: body.creditCode ? 0 : 10000, currency: 'BOB', shippingOptions: [] } }); });
  await page.route('**/commerce/orders/order-token/downloads', async route => { downloads++; await route.fulfill({ json: [{ filename: 'guide.pdf', url: `/v1/commerce/downloads/test${downloads}.signature` }] }); });
  const quotePath = '/@fs' + new URL('../../checkout/src/cart-quote.ts', import.meta.url).pathname;
  const downloadPath = '/@fs' + new URL('../../checkout/src/digital-downloads.ts', import.meta.url).pathname;
  await page.evaluate(async ({ quotePath, downloadPath }) => {
    const { mountCartQuote } = await import(quotePath); const { mountDigitalDownloads } = await import(downloadPath);
    document.body.innerHTML = '<main id="quote"></main><output id="total"></output><button id="finish">Continuar</button><p id="result"></p><section id="downloads"></section>';
    const get = mountCartQuote(document.querySelector('#quote'), { slug: 'test', items: [{ paymentLinkId: 'p1', quantity: 1 }], shipping: false, credits: true, pickup: false, money: (n: number) => String(n / 100), onQuote: (q: any) => document.querySelector('#total')!.textContent = String(q.amount) });
    document.querySelector('#finish')!.addEventListener('click', () => { try { (window as any).creditSelection = get(); document.querySelector('#result')!.textContent = 'Listo'; } catch (e: any) { document.querySelector('#result')!.textContent = e.message; } });
    await mountDigitalDownloads(document.querySelector('#downloads'), 'order-token');
  }, { quotePath, downloadPath });
  await expect(page.locator('#total')).toHaveText('10000');
  await page.getByLabel('Tarjeta de regalo o saldo').fill('ABCD1234-ABCD1234-ABCD1234-ABCD1234');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await expect(page.locator('#result')).not.toHaveText('Listo');
  await page.getByRole('button', { name: 'Aplicar saldo' }).click(); await expect(page.locator('#total')).toHaveText('0');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await expect(page.locator('#result')).toHaveText('Listo');
  expect(await page.evaluate(() => (window as any).creditSelection.creditCode)).toBe('ABCD1234-ABCD1234-ABCD1234-ABCD1234'); expect(quotes).toBe(2);
  await expect(page.getByRole('link', { name: 'Descargar guide.pdf' })).toHaveAttribute('href', /test1.signature$/);
  await page.getByRole('button', { name: 'Renovar enlaces' }).click(); await expect(page.getByRole('link', { name: 'Descargar guide.pdf' })).toHaveAttribute('href', /test2.signature$/);
});
