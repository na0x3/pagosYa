import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const commerce = readFileSync(new URL('../../api/src/stores/source-kit/commerce.js', import.meta.url), 'utf8');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const secondPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const photo1 = 'http://localhost:3001/v1/uploads/1111-aaaa.png';
const photo2 = '/v1/uploads/2222-bbbb.png';
const snapshot = {
  schemaVersion: 1, brief: { businessType: 'Tienda', audience: 'Clientes', primaryAction: 'Comprar', visualDirection: 'Simple' },
  files: [
    { path: 'index.html', content: '<html><head><style>.menu-item{display:grid;grid-template-columns:100px 1fr 50px 44px;gap:12px;padding:12px}.menu-item__image{width:100px;height:100px;object-fit:contain}.menu-add{height:44px}</style><script src="config.js" defer></script><script src="commerce.js" defer></script></head><body><main data-pagosya-catalog></main><span data-cart-count></span><div data-pagosya-cart></div><p data-pagosya-status></p></body></html>' },
    { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ apiBaseUrl: 'http://localhost:3001/v1', slug: 'test', data: { storeName: 'Prueba', items: [
      { id: 'p1', name: 'Crema de maní', description: 'Frasco de 350 g', amount: 5000, currency: 'BOB', stock: 1, imageUrls: [photo1, photo2] },
      { id: 'p2', name: 'Una foto', amount: 3000, currency: 'BOB', stock: 2, imageUrls: [photo1] },
      { id: 'p3', name: 'Sin foto', amount: 2000, currency: 'BOB', stock: 0, imageUrls: [] },
    ] } })};` },
    { path: 'commerce.js', content: commerce },
  ],
};

async function preview(page: import('@playwright/test').Page) {
  await page.goto('/?demo=1');
  await page.route('**/api/v1/uploads/*.png', route => route.fulfill({ contentType: 'image/png', body: route.request().url().includes('2222-bbbb') ? secondPng : png }));
  return page.evaluate(async snapshot => {
    const { createPreviewImageLoader } = await import('/src/source-preview-media.ts' as string);
    const { sourcePreviewDocument } = await import('/src/source-preview.ts' as string);
    const hydrate = createPreviewImageLoader('/api/v1');
    const original = JSON.stringify(snapshot);
    const hydrated = await hydrate(snapshot);
    await hydrate(snapshot); // Cached uploads should not refetch.
    document.body.innerHTML = '';
    const frame = document.createElement('iframe'); frame.title = 'Catálogo'; frame.sandbox.add('allow-scripts');
    frame.style.cssText = 'width:100%;height:95vh;border:0';
    frame.srcdoc = sourcePreviewDocument(hydrated); document.body.append(frame);
    return { unchanged: original === JSON.stringify(snapshot), config: hydrated.files.find((f: any) => f.path === 'config.js').content };
  }, snapshot);
}

test('preview embeds uploaded catalogue photos and opens an accessible multi-photo detail with stock limits', async ({ page }) => {
  const uploads: string[] = [];
  page.on('request', request => { if (request.url().includes('/uploads/')) uploads.push(request.url()); });
  const result = await preview(page);
  expect(result.unchanged).toBe(true);
  expect(result.config).toContain('data:image/png;base64,');
  expect(uploads).toHaveLength(2);
  expect(uploads.every(url => url.startsWith('http://127.0.0.1:4312/api/v1/uploads/'))).toBe(true);
  const frame = page.frameLocator('iframe');
  const first = frame.locator('.menu-item__image').first();
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  const card = frame.getByRole('button', { name: 'Ver detalle de Crema de maní', exact: true });
  await card.click();
  const detail = frame.getByRole('dialog', { name: 'Crema de maní', exact: true });
  await expect(detail).toBeVisible();
  await expect(detail.getByText('Frasco de 350 g')).toBeVisible();
  await expect(detail.locator('[data-product-count]')).toHaveText('1 / 2');
  await detail.getByRole('button', { name: 'Foto siguiente' }).click();
  await expect(detail.locator('[data-product-count]')).toHaveText('2 / 2');
  await expect(detail.getByRole('button', { name: 'Ver foto 2' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(detail.locator('[data-product-count]')).toHaveText('1 / 2');
  await detail.getByRole('button', { name: 'Ver foto 2' }).click();
  await expect(detail.locator('.product-detail__photo')).toHaveAttribute('alt', /imagen 2 de 2/);
  await detail.getByRole('button', { name: 'Añadir al pedido' }).click();
  await expect(frame.locator('[data-cart-count]')).toHaveText('1');
  await expect(detail.getByRole('button', { name: 'Añadir al pedido' })).toBeDisabled();
  await expect(detail.getByRole('status')).toContainText('añadido');
  await page.screenshot({ path: '.test-artifacts/product-detail-desktop.png' });
  await page.keyboard.press('Escape');
  await expect(detail).not.toBeVisible();
  await expect(card).toBeFocused();
  await expect(frame.getByRole('button', { name: 'Añadir Crema de maní', exact: true })).toBeDisabled();
  await frame.getByRole('button', { name: 'Añadir Una foto', exact: true }).click();
  await expect(detail).not.toBeVisible();
  await expect(frame.locator('[data-cart-count]')).toHaveText('2');
});

test('mobile product detail supports swipe, one photo, and sold-out products without photos', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preview(page);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: 'Ver detalle de Crema de maní', exact: true }).click();
  const detail = frame.getByRole('dialog');
  await detail.locator('.product-detail__photo').evaluate(el => {
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [new Touch({ identifier: 1, target: el, clientX: 280, clientY: 160 })] }));
    el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [new Touch({ identifier: 1, target: el, clientX: 90, clientY: 170 })] }));
  });
  await expect(detail.locator('[data-product-count]')).toHaveText('2 / 2');
  expect(await detail.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: '.test-artifacts/product-detail-mobile.png' });
  await detail.getByRole('button', { name: 'Cerrar detalle del producto' }).click();
  await frame.getByRole('button', { name: 'Ver detalle de Una foto', exact: true }).click();
  await expect(detail.locator('[data-product-count]')).toHaveText('1 / 1');
  await expect(detail.getByRole('button', { name: 'Foto siguiente' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(detail).not.toBeVisible();
  await frame.getByRole('button', { name: 'Ver detalle de Sin foto', exact: true }).click();
  await expect(detail.locator('.product-detail__gallery')).toBeHidden();
  await expect(detail.locator('.product-detail__layout')).toHaveAttribute('data-no-images', '');
  await expect(detail.getByText('Agotado', { exact: true })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Añadir al pedido' })).toHaveCount(0);
});

test('image loader never fetches arbitrary hosts, tolerates failed uploads and retries later', async ({ page }) => {
  await page.goto('/?demo=1');
  let attempts = 0;
  await page.route('**/api/v1/uploads/1111-aaaa.png', route => {
    attempts++;
    return route.fulfill(attempts === 1 ? { status: 404 } : { contentType: 'image/png', body: png });
  });
  const result = await page.evaluate(async snapshot => {
    const { createPreviewImageLoader } = await import('/src/source-preview-media.ts' as string);
    const hydrate = createPreviewImageLoader('/api/v1');
    const configFile = snapshot.files.find(f => f.path === 'config.js')!;
    configFile.content = `window.PAGOSYA_CONFIG = ${JSON.stringify({ data: { items: [{ imageUrls: ['https://untrusted.invalid/arbitrary.png', 'https://untrusted.invalid/v1/uploads/1111-aaaa.png'] }] } })};`;
    const first = await hydrate(snapshot), second = await hydrate(snapshot);
    return [first, second].map(s => JSON.parse(s.files.find((f: any) => f.path === 'config.js').content.replace(/^window.PAGOSYA_CONFIG = /, '').replace(/;$/, '')).data.items[0].imageUrls);
  }, structuredClone(snapshot));
  expect(attempts).toBe(2);
  expect(result[0]).toEqual(['https://untrusted.invalid/arbitrary.png', '']);
  expect(result[1][1]).toMatch(/^data:image\/png;base64,/);
});

test('checkout opens a full review, supports returning with the cart intact and completes a clearly marked test payment', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preview(page);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: 'Añadir Una foto', exact: true }).click();
  await frame.getByRole('button', { name: 'Continuar con mi pedido', exact: true }).click();
  const checkout = frame.locator('[data-pagosya-checkout]');
  await expect(checkout.getByRole('heading', { name: 'Revisa tu pedido' })).toBeVisible();
  await expect(checkout.locator('.order-item')).toContainText('Una foto');
  await checkout.getByRole('button', { name: 'Añadir una unidad de Una foto' }).click();
  await expect(checkout.locator('.quantity output')).toHaveText('2');
  await checkout.getByRole('button', { name: 'Volver a la tienda' }).click();
  await expect(checkout).not.toBeVisible();
  await expect(frame.locator('[data-cart-count]')).toHaveText('2');
  await frame.getByRole('button', { name: 'Continuar con mi pedido', exact: true }).click();
  await page.screenshot({ path: '.test-artifacts/source-checkout-mobile.png' });
  expect(await checkout.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await checkout.getByRole('button', { name: 'Continuar al pago de prueba' }).click();
  await expect(checkout.getByRole('heading', { name: 'Pago de prueba' })).toBeVisible();
  await checkout.getByRole('button', { name: 'Volver al resumen' }).click();
  await expect(checkout.getByRole('heading', { name: 'Revisa tu pedido' })).toBeVisible();
  await checkout.getByRole('button', { name: 'Continuar al pago de prueba' }).click();
  await checkout.getByRole('button', { name: 'Completar prueba' }).click();
  await expect(checkout).not.toBeVisible();
  await expect(frame.locator('[data-pagosya-status]')).toHaveText('Prueba completada. No se creó ningún pedido ni se realizó ningún cobro.');
});

test('local page links navigate in the sandbox and retain the cart, while forged navigation is ignored', async ({ page }) => {
  await preview(page);
  const multi = structuredClone(snapshot);
  multi.files[0].content = multi.files[0].content.replace('<main', '<a href="pages/about.html#details">Cómo comprar</a><main');
  multi.files.push({ path: 'pages/about.html', content: '<h1 id="details">Cómo comprar</h1><a href="../index.html">Volver al catálogo</a><div data-pagosya-cart></div><span data-cart-count></span><script src="../config.js" defer></script><script src="../commerce.js" defer></script>' });
  await page.evaluate(async snapshot => {
    const { sourcePreviewDocument, receivePreviewNavigation } = await import('/src/source-preview.ts' as string);
    const { createPreviewImageLoader } = await import('/src/source-preview-media.ts' as string);
    const hydrated = await createPreviewImageLoader('/api/v1')(snapshot);
    const frame = document.querySelector('iframe')!;
    frame.srcdoc = sourcePreviewDocument(hydrated);
    window.addEventListener('message', event => {
      const next = receivePreviewNavigation(event, frame, hydrated);
      if (next) frame.srcdoc = sourcePreviewDocument(hydrated, next.page, next);
    });
    window.postMessage({ type: 'pagosya:source-navigate', page: 'pages/about.html' }, '*');
  }, multi);
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('button', { name: 'Añadir Una foto', exact: true })).toBeVisible();
  await frame.getByRole('button', { name: 'Añadir Una foto', exact: true }).click();
  await frame.getByRole('link', { name: 'Cómo comprar' }).click();
  await expect(frame.getByRole('heading', { name: 'Cómo comprar' })).toBeVisible();
  await expect(frame.locator('[data-cart-count]')).toHaveText('1');
  await frame.getByRole('link', { name: 'Volver al catálogo' }).click();
  await expect(frame.getByRole('button', { name: 'Añadir Una foto', exact: true })).toBeVisible();
  await expect(frame.locator('[data-cart-count]')).toHaveText('1');
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
});
