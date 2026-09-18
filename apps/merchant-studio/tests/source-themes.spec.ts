import { test, expect } from '@playwright/test';

for (const existing of [false, true]) test(`freeform design without presets (${existing ? 'existing' : 'new'} site)`, async ({ page }) => {
  const requests: any[] = [];
  const messages: any[] = [{ id: 'old', role: 'USER', content: 'Mi negocio', metadata: { revision: existing ? 1 : 0, themeId: 'print-club' } }];
  const version = { revision: 1, label: 'Mi tienda', snapshot: { schemaVersion: 1, brief: { businessType: 'Tienda', audience: 'Clientes', primaryAction: 'Comprar', visualDirection: 'Propia' }, files: [
    { path: 'index.html', content: '<main><h1>Mi tienda</h1><div data-pagosya-catalog></div></main>' },
    { path: 'styles.css', content: 'body { color: #211c16; }' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"items":[]}};' },
    { path: 'design-direction.json', content: '{"themeId":"print-club"}' },
  ] } };
  await page.addInitScript(() => { if (window === window.top) sessionStorage.setItem('pagosya_merchant_session', 'test-session'); });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname; let body: any = {};
    if (path.endsWith('/stores')) body = [{ id: 's1', name: 'Mi tienda', slug: 'mi-tienda' }];
    else if (path.endsWith('/source-project')) body = { revision: existing ? 1 : 0, versions: existing ? [version] : [], nextBefore: null };
    else if (path.endsWith('/versions/1')) body = version;
    else if (path.endsWith('/conversation')) body = { messages };
    else if (path.endsWith('/catalog')) body = { items: [] };
    else if (path.endsWith('/estimate')) body = { estimate: { minCredits: 4, maxCredits: 10 } };
    else if (path.endsWith('/messages')) {
      const input = route.request().postDataJSON(); requests.push(input);
      const userMessage = { id: 'u' + requests.length, role: 'USER', content: input.instruction };
      const assistantMessage = { id: 'a' + requests.length, role: 'ASSISTANT', content: 'Pedido recibido.' };
      messages.push(userMessage, assistantMessage); body = { userMessage, assistantMessage };
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/?source=1');
  await expect(page.getByRole('button', { name: 'Temas', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-selected-theme], [data-theme-choice]')).toHaveCount(0);
  if (existing) {
    await expect(page.frameLocator('iframe[title="Vista previa del sitio"]').getByRole('heading', { name: 'Mi tienda' })).toBeVisible();
    await page.getByRole('button', { name: 'Código', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Código del archivo' })).toHaveValue(/Mi tienda/);
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  } else {
    await expect(page.getByRole('heading', { name: 'Tu negocio, tu sitio.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear tienda desde una foto', exact: true })).toBeEnabled();
  }
  const composer = page.getByRole('textbox', { name: 'Indicación para YAPI' });
  const instruction = 'Quiero una composición inspirada en mis fotos, con azul y verde.';
  await composer.fill(instruction);
  await page.getByRole('button', { name: 'Enviar a YAPI', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].instruction).toBe(instruction);
  expect(requests[0]).not.toHaveProperty('themeId');
  await page.reload();
  await expect(page.locator('[data-selected-theme]')).toHaveCount(0);
  await composer.fill('Conserva las fotos y cambia solo el título.');
  await page.getByRole('button', { name: 'Enviar a YAPI', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).not.toHaveProperty('themeId');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Temas', exact: true })).toHaveCount(0);
  }
});
