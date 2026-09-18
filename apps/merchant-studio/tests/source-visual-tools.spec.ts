import { test, expect } from '@playwright/test';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
for (const mobile of [false, true]) test(`visual resources without AI review action (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
  await page.setViewportSize({ width: mobile ? 390 : 1280, height: 844 });
  let revision = 1, paid = 0;
  let roles: any[] = [{ path: 'assets/photo.png', role: 'unknown', description: '' }];
  const version = () => ({ revision, label: 'Café', snapshot: { schemaVersion: 1, brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Fotografía' }, files: [
    { path: 'index.html', content: '<html><head><title>Café</title></head><body><h1>Café</h1><img src="assets/icons/coffee.svg" alt="Café icono"><script src="config.js"></script><script src="commerce.js"></script></body></html>' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"items":[]}};' }, { path: 'commerce.js', content: '' },
    { path: 'assets/photo.png', content: image, encoding: 'base64' }, { path: 'assets/icons/coffee.svg', content: svg },
  ] } });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname; let body: any = {};
    if (path.endsWith('/dashboard/login')) body = { token: 'test-session', user: { email: 'test@example.com' } };
    else if (path.endsWith('/stores')) body = [{ id: 's1', name: 'Café', slug: 'cafe' }];
    else if (path.endsWith('/conversation')) body = { messages: [] };
    else if (path.endsWith('/catalog')) body = { items: [] };
    else if (path.endsWith('/estimate')) body = { estimate: { minCredits: 1, maxCredits: 4 } };
    else if (/\/versions\/\d+$/.test(path)) body = version();
    else if (path.endsWith('/source-project')) body = { revision, versions: [version()], nextBefore: null };
    else if (path.endsWith('/assets')) {
      if (route.request().method() === 'PATCH') { roles = route.request().postDataJSON().assets; revision++; body = version(); }
      else body = { revision, assets: roles.map(a => ({ ...a, kind: 'image', references: [], bytes: 68 })), icons: [{ name: 'coffee', path: 'assets/icons/coffee.svg', svg }], iconLibrary: 'Lucide 1.31.0' };
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/?source=1');
  await page.getByLabel('Correo', { exact: true }).fill('test@example.com');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al Studio', exact: true }).click();
  await page.getByRole('button', { name: 'Recursos visuales', exact: true }).click();
  const resources = page.getByRole('region', { name: 'Recursos visuales', exact: true });
  await expect(resources.getByRole('heading', { name: 'Recursos visuales' })).toBeFocused();
  await resources.getByRole('combobox', { name: 'Uso', exact: true }).selectOption('unused');
  await expect(resources.getByRole('button', { name: 'Usar esta imagen' })).toBeDisabled();
  await resources.getByRole('combobox', { name: 'Uso', exact: true }).selectOption('product');
  await expect(resources.getByRole('button', { name: 'Usar esta imagen' })).toBeEnabled();
  await resources.getByLabel('Descripción').fill('Café de la casa');
  await resources.getByRole('button', { name: 'Guardar usos' }).click();
  await expect.poll(() => revision).toBe(2);
  await page.getByRole('button', { name: 'Recursos visuales', exact: true }).click();
  await expect(resources.getByRole('combobox', { name: 'Uso', exact: true })).toHaveValue('product');
  await expect(resources.getByLabel('Descripción')).toHaveValue('Café de la casa');
  await resources.getByRole('button', { name: 'Café', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Indicación para YAPI' })).toHaveValue(/assets\/icons\/coffee.svg/);
  expect(paid).toBe(0);
  await resources.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Revisar diseño', exact: true })).toHaveCount(0);
  expect(paid).toBe(0);
  await page.screenshot({ path: `/private/tmp/yapi-visual-tools-${mobile ? 'mobile' : 'desktop'}.png` });
});
