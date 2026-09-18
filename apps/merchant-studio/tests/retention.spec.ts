import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const settings = { revision: 0, comebackEnabled: false, visitsRequired: 5, rewardLabel: 'Un café gratis', timezone: 'America/La_Paz', signupEnabled: false, signupTitle: 'Club del café', signupBody: 'Beneficios para quienes vuelven.', signupButton: 'Unirme al club', recoveryEnabled: false, recoveryHours: 24, welcomeEnabled: false, welcomeSubject: 'Bienvenido a {{store}}', welcomeBody: 'Gracias por unirte.' };

test('subscription popup matches the photo/form reference, remembers dismissal and saves chosen interests', async ({ page }) => {
  const runtime = readFileSync(new URL('../../api/src/stores/source-kit/retention.js', import.meta.url), 'utf8');
  const body = { ...settings, comebackEnabled: true, signupEnabled: true, signupTitle: 'Un lugar para tus favoritos', signupBody: 'Súmate a la comunidad de PEANU y recibe nuevas selecciones y novedades de nuestra tienda, directo a tu correo.', signupButton: 'Quiero ser parte', signupVisual: { brand: { name: 'PEANU', background: '#f3eddf', foreground: '#26221c', fontStyle: 'editorial' }, imageUrl: 'https://commerce.example/product.webp', interests: ['Mantequillas de nueces', 'Mantequillas de maní', 'Snacks'] } };
  let payload: any; let submissions = 0;
  await page.route('https://commerce.example/product.webp', route => route.fulfill({ body: readFileSync(new URL('./fixtures/retention-product.webp', import.meta.url)), contentType: 'image/webp' }));
  await page.route('https://commerce.example/v1/**', route => {
    if (route.request().url().endsWith('/subscribe')) { submissions++; payload = route.request().postDataJSON(); return route.fulfill({ json: { subscribed: true } }); }
    return route.fulfill({ json: body });
  });
  await page.goto('/?demo=1');
  await page.setContent('<style>body{margin:0;background:#f8f5ec;color:#26221c;font-family:Georgia,serif}main{padding:60px}h1{font-size:64px}</style><main><p>PEANU</p><h1>Tus favoritos, cada día.</h1><p>Explora nuestra selección.</p><button>Ver productos</button><section data-pagosya-comeback></section></main>');
  await page.addScriptTag({ content: runtime });
  const mount = () => page.evaluate(async () => { await (window as any).PAGOSYA_RETENTION_MOUNT({ slug: 'popup-test', apiBaseUrl: 'https://commerce.example/v1' }); });
  await mount();
  const dialog = page.getByRole('dialog', { name: body.signupTitle });
  await expect(dialog).toBeVisible(); await expect(page.locator('[data-pagosya-comeback]')).toBeHidden();
  await expect(dialog.locator('.pagosya-signup-photo img')).toBeVisible();
  await dialog.locator('.pagosya-signup-photo img').evaluate(async (el: HTMLImageElement) => { await el.decode(); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '.test-artifacts/subscription-popup-desktop.png' });
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  await mount(); await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Comunidad', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: '.test-artifacts/subscription-popup-mobile.png' });
  await dialog.getByLabel('Nombre (opcional)', { exact: true }).fill('Doris');
  await dialog.getByLabel('Tu correo', { exact: true }).fill('doris@example.com');
  await dialog.getByLabel('WhatsApp / Teléfono (opcional)').fill('+591 70000000');
  await dialog.getByLabel('Snacks', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Quiero ser parte' }).click(); expect(submissions).toBe(0);
  await dialog.getByLabel('Quiero recibir novedades', { exact: false }).check();
  await dialog.getByRole('button', { name: 'Quiero ser parte' }).click();
  await expect(dialog.getByRole('status')).toContainText('comunidad');
  expect(payload).toEqual({ email: 'doris@example.com', name: 'Doris', phone: '+591 70000000', interests: ['Snacks'], consent: true });
  await expect(dialog.locator('form')).toBeHidden();
  await dialog.getByRole('button', { name: 'Cerrar suscripción' }).click();
  await expect(page.getByRole('button', { name: 'Comunidad', exact: true })).toBeHidden();
});

test('preview renders Comunidad inline without a fixed control covering storefront copy', async ({ page }) => {
  const runtime = readFileSync(new URL('../../api/src/stores/source-kit/retention.js', import.meta.url), 'utf8');
  const retention = { ...settings, signupEnabled: true, signupTitle: 'Un lugar para tus favoritos', signupBody: 'Súmate a la comunidad y recibe novedades de la tienda.', signupButton: 'Quiero ser parte', signupVisual: { brand: { name: 'PEANU', background: '#f3eddf', foreground: '#26221c', fontStyle: 'editorial' }, imageUrl: 'https://commerce.example/product.webp' } };
  await page.route('https://commerce.example/product.webp', route => route.fulfill({ body: readFileSync(new URL('./fixtures/retention-product.webp', import.meta.url)), contentType: 'image/webp' }));
  await page.goto('/?demo=1');
  await page.setContent('<main><h1>Una tienda que se siente cercana</h1><p>El catálogo conserva su lectura aunque cambie el contenido.</p><section data-pagosya-subscribe></section><footer>Volver pronto</footer></main>');
  await page.addScriptTag({ content: runtime });
  await page.evaluate(retention => (window as any).PAGOSYA_RETENTION_MOUNT({ slug: 'preview-test', preview: true, data: { retention } }), retention);
  await expect(page.locator('.pagosya-signup-launcher')).toBeVisible();
  await expect(page.locator('dialog')).toHaveCount(0);
  const metrics = await page.locator('.signup-reopen').evaluate(el => ({ position: getComputedStyle(el).position, disabled: (el as HTMLButtonElement).disabled, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
  expect(metrics.position).toBe('static');
  expect(metrics.disabled).toBe(true);
  expect(metrics.bottom).toBeLessThanOrEqual(await page.evaluate(() => document.body.scrollHeight));
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('personal loyalty card uses the reference layout, real QR and accurate available rewards', async ({ page }) => {
  const runtime = readFileSync(new URL('../../api/src/stores/source-kit/retention.js', import.meta.url), 'utf8');
  const require = createRequire(new URL('../../api/package.json', import.meta.url));
  const qr = await require('qrcode').toDataURL('CB-test-1234567890123456', { width: 240, margin: 4 });
  await page.goto('/?demo=1');
  await page.setContent('<style>body{margin:0;background:#faf9f6;color:#241e19;font-family:system-ui}main{padding:24px}</style><main><section id="card"></section></main>');
  await page.addScriptTag({ content: runtime });
  await page.evaluate(qr => (window as any).PAGOSYA_COMEBACK_RENDER(document.querySelector('#card'), { brand: { name: 'Urban Roasters Co', background: '#b69b88', foreground: '#241e19', stamp: 'coffee' }, customerName: 'Doris', visits: 27, visitsRequired: 10, availableRewards: 2, rewardLabel: 'Un café de la casa', code: 'CB-test-1234567890123456', qrImageDataUrl: qr, cardUrl: 'https://checkout.example/s/urban?comeback=private' }), qr);
  await expect(page.getByText('2 premios', { exact: true })).toBeVisible();
  await expect(page.locator('.comeback-stamps [data-earned=true]')).toHaveCount(7);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '.test-artifacts/comeback-card-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.test-artifacts/comeback-card-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('merchant configures retention and reviews a campaign before explicit sending, on desktop and mobile', async ({ page }) => {
  const state: any = { settings: { ...settings }, subscribers: [{ email: 'cliente@example.com', createdAt: '2026-09-08' }], subscriberCount: 1, cards: 0, carts: 0, campaigns: [], deliveries: [], emailConfigured: true };
  let sends = 0;
  await page.goto('/?demo=1');
  await page.route('**/stores/s1/retention**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'PUT') state.settings = { ...route.request().postDataJSON(), revision: 1 };
    if (path.endsWith('/campaigns')) { const draft = { ...route.request().postDataJSON(), id: 'c1', queuedAt: null, _count: { deliveries: 0 } }; state.campaigns.unshift(draft); return route.fulfill({ json: draft }); }
    if (path.endsWith('/send')) { sends++; state.campaigns[0].queuedAt = new Date().toISOString(); state.campaigns[0]._count.deliveries = 1; return route.fulfill({ json: { queued: 1 } }); }
    return route.fulfill({ json: state });
  });
  await page.evaluate(async () => { const { openRetention } = await import('/src/retention.ts'); const { MerchantStudioApi } = await import('/src/api.ts'); await openRetention(new MerchantStudioApi(), 's1'); });
  await page.getByLabel('Activar tarjeta digital').check(); await page.getByLabel('Compras en días distintos').fill('4'); await page.getByLabel('Mostrar formulario de suscripción').check(); await page.getByLabel('Ofrecer un recordatorio por correo').check();
  await page.getByRole('button', { name: 'Guardar configuración' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Configuración guardada' })).toBeVisible();
  expect(state.settings).toMatchObject({ comebackEnabled: true, visitsRequired: 4, signupEnabled: true, recoveryEnabled: true });
  await page.locator('dialog').evaluate(el => el.scrollTop = 0);
  await page.screenshot({ path: '.test-artifacts/retention-desktop.png' });
  await page.getByRole('button', { name: 'Campañas', exact: true }).click();
  await page.getByLabel('Asunto', { exact: true }).fill('Este viernes, volvamos a vernos'); await page.getByLabel('Mensaje', { exact: true }).fill('Tenemos una nueva selección de café para ti.');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('region', { name: 'Vista previa del correo' })).toContainText('Tenemos una nueva selección'); expect(sends).toBe(0);
  await page.getByRole('button', { name: 'Enviar a los suscriptores' }).click(); expect(sends).toBe(1);
  await expect(page.getByRole('status').filter({ hasText: 'Campaña en cola' })).toBeVisible();
  await page.getByRole('button', { name: 'Comeback Card', exact: true }).click(); await page.setViewportSize({ width: 390, height: 844 }); await page.locator('dialog').evaluate(el => el.scrollTop = 0);
  expect(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: '.test-artifacts/retention-mobile.png' });
});

test('storefront inherits brand, captures consent, preserves recovery token through cart changes, and shows a digital reward', async ({ page }) => {
  const commerce = readFileSync(new URL('../../api/src/stores/source-kit/commerce.js', import.meta.url), 'utf8');
  const retention = readFileSync(new URL('../../api/src/stores/source-kit/retention.js', import.meta.url), 'utf8');
  const store = { storeName: 'Café Pausa', checkoutMode: 'payment', items: [{ id: 'p1', name: 'Café de origen', amount: 1800, stock: 10, imageUrls: [], currency: 'BOB' }], locations: [], categories: [] };
  const payloads: any[] = [];
  await page.goto('/?comeback=' + 'a'.repeat(64));
  await page.route('https://commerce.example/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/store')) return route.fulfill({ json: store });
    if (path.endsWith('/retention')) return route.fulfill({ json: { ...settings, comebackEnabled: true, signupEnabled: true, recoveryEnabled: true } });
    if (path.includes('/cards/')) return route.fulfill({ json: { visits: 4, visitsRequired: 4, rewardLabel: 'Un café gratis', code: 'CB-test-1234567890123456', redeemed: 0 } });
    payloads.push({ path, body: route.request().postDataJSON() });
    return route.fulfill({ json: { submitted: true, saved: true, token: 'b'.repeat(64) } });
  });
  await page.setContent('<style>body{background:#f8f1e5;color:#273d31;font-family:Georgia,serif;--paper:#f8f1e5;--ink:#273d31;--brand-accent:#273d31}main{max-width:1000px;margin:auto}header{padding:32px;font-size:24px}footer{padding:32px}</style><header>CAFÉ PAUSA</header><main><h1>Café para volver.</h1><div data-pagosya-catalog></div><div data-pagosya-cart></div><p data-pagosya-status></p></main><footer>Nos vemos en la próxima pausa.</footer>');
  await page.addScriptTag({ content: `window.PAGOSYA_CONFIG=${JSON.stringify({ slug: 'cafe', apiBaseUrl: 'https://commerce.example/v1', checkoutOrigin: 'https://checkout.example', data: store })};` });
  await page.addScriptTag({ content: commerce + '\n' + retention });
  await expect(page.getByRole('heading', { name: 'Tu tarjeta Comeback' })).toBeVisible();
  expect(await page.locator('[data-pagosya-comeback]').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Georgia');
  await page.getByRole('button', { name: 'Comunidad', exact: true }).click();
  const subscription = page.locator('[data-pagosya-subscribe]');
  await subscription.getByLabel('Tu correo', { exact: true }).fill('cliente@example.com');
  await subscription.getByRole('checkbox').check(); await subscription.getByRole('button', { name: 'Unirme al club' }).click();
  await expect(subscription.getByRole('status')).toContainText('comunidad');
  expect(payloads.at(-1).body).toEqual({ email: 'cliente@example.com', consent: true });
  await page.getByRole('button', { name: 'Cerrar suscripción' }).click();
  await page.getByRole('button', { name: 'Añadir Café de origen', exact: true }).click();
  const recovery = page.locator('[data-retention-recovery]').first();
  await recovery.getByLabel('Tu correo', { exact: true }).fill('cliente@example.com'); await recovery.getByRole('checkbox').check(); await recovery.getByRole('button', { name: 'Guardar y recordármelo' }).click();
  await expect(recovery.getByRole('status')).toContainText('Carrito guardado'); expect(payloads.at(-1).body.items).toEqual([{ paymentLinkId: 'p1', quantity: 1 }]);
  await page.getByRole('button', { name: 'Añadir Café de origen', exact: true }).click();
  await expect(page.locator('[data-retention-recovery]').first().getByLabel('Tu correo', { exact: true })).toHaveValue('cliente@example.com');
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('[data-pagosya-comeback]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.test-artifacts/comeback-storefront-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('hosted storefront subscribes and preserves saved-cart identity across page navigation', async ({ page }) => {
  const commerce = readFileSync(new URL('../../api/src/stores/source-kit/commerce.js', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('../../api/src/stores/source-kit/retention.js', import.meta.url), 'utf8');
  const store = { storeName: 'Club', checkoutMode: 'payment', items: [{ id: 'p1', name: 'Café', amount: 1800, currency: 'BOB', stock: 10 }], categories: [], locations: [] };
  const snapshot = { schemaVersion: 1, brief: {}, files: [
    { path: 'index.html', content: '<main><div data-pagosya-catalog></div><div data-pagosya-cart></div><p data-pagosya-status></p></main><script src="config.js"></script><script src="commerce.js"></script>' },
    { path: 'checkout.html', content: '<main data-pagosya-checkout-page></main><script src="config.js"></script><script src="commerce.js"></script>' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG=' + JSON.stringify({ slug: 'retention-test', data: store, checkoutPage: 'checkout.html' }) + ';' }, { path: 'commerce.js', content: commerce },
  ] };
  let checkout: any; let subscribed = false;
  await page.route('**/stores/public/retention-test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/source-site')) return route.fulfill({ json: { published: true, revision: 1, snapshot } });
    if (path.endsWith('/retention')) return route.fulfill({ json: { ...settings, signupEnabled: true, recoveryEnabled: true } });
    if (path.endsWith('/subscribe')) { subscribed = route.request().postDataJSON().consent; return route.fulfill({ json: { subscribed: true } }); }
    if (path.endsWith('/carts')) return route.fulfill({ json: { saved: true, token: 'c'.repeat(64) } });
    if (path.endsWith('/cart-checkout')) { checkout = route.request().postDataJSON(); return route.fulfill({ json: { clientSecret: 'test-only-secret' } }); }
    throw new Error(path);
  });
  await page.goto('/?demo=1');
  const path = '/@fs' + new URL('../../checkout/src/source-storefront.ts', import.meta.url).pathname;
  await page.evaluate(async ({ path, store }) => { const { mountPublishedSource } = await import(path); document.body.innerHTML = '<main id="shop"></main>'; await mountPublishedSource(document.querySelector('#shop'), 'retention-test', store, async () => { document.querySelector('#shop')!.textContent = 'Pago listo'; }); }, { path, store });
  const frame = page.frameLocator('iframe'); const signup = frame.locator('[data-pagosya-subscribe]');
  await signup.getByLabel('Tu correo', { exact: true }).fill('cliente@example.com'); await signup.getByRole('checkbox').check(); await signup.getByRole('button', { name: 'Unirme al club' }).click();
  await expect(signup.getByRole('status')).toContainText('comunidad'); expect(subscribed).toBe(true);
  await signup.getByRole('button', { name: 'Cerrar suscripción' }).click();
  await frame.getByRole('button', { name: 'Añadir Café', exact: true }).click(); const recovery = frame.locator('[data-retention-recovery]');
  await recovery.getByLabel('Tu correo', { exact: true }).fill('cliente@example.com'); await recovery.getByRole('checkbox').check(); await recovery.getByRole('button').click(); await expect(recovery.getByRole('status')).toContainText('Carrito guardado');
  await frame.getByRole('button', { name: 'Continuar con mi pedido' }).click();
  await frame.getByRole('button', { name: 'Pagar con pagosYa' }).click(); await expect(page.getByText('Pago listo')).toBeVisible(); expect(checkout.recoveryToken).toBe('c'.repeat(64));
});
