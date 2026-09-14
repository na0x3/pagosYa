import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) test(`durable improvement restores after reload without paid replay (${width})`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  let starts = 0, cancels = 0, job: any = null;
  const version = { revision: 1, label: 'Café', snapshot: { schemaVersion: 1, brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Carta' }, files: [
    { path: 'index.html', content: '<h1>Café</h1>' }, { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"items":[]}};' },
  ] } };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname; let body: any = {};
    if (path.endsWith('/dashboard/login')) body = { token: 'test-session', user: { email: 'test@example.com' } };
    else if (path.endsWith('/stores')) body = [{ id: 's1', name: 'Café', slug: 'cafe' }];
    else if (path.endsWith('/conversation')) body = { messages: [] };
    else if (path.endsWith('/catalog')) body = { items: [] };
    else if (path.endsWith('/estimate')) body = { estimate: { minCredits: 1, maxCredits: 4 } };
    else if (/\/versions\/\d+$/.test(path)) body = version;
    else if (path.endsWith('/source-project')) body = { revision: 1, versions: [version], nextBefore: null };
    else if (path.endsWith('/design-jobs') && route.request().method() === 'GET') body = { enabled: true, job };
    else if (path.endsWith('/design-jobs') && route.request().method() === 'POST') {
      starts++; const input = route.request().postDataJSON(); expect(input.maxCredits).toBe(140); expect(input.requestId).toMatch(/^[0-9a-f-]{36}$/);
      body = job = { ...input, id: 'job-1', status: 'RUNNING', stage: 'REPAIR', observedCredits: 2, reservedCredits: 87, error: null, resultRevision: null, resumeAvailable: false, report: null };
    } else if (path.endsWith('/job-1/cancel')) { cancels++; body = job = { ...job, status: 'CANCELLED' }; }
    await route.fulfill({ json: body });
  });
  await page.goto('/?source=1');
  await page.getByLabel('Correo', { exact: true }).fill('test@example.com');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al Studio', exact: true }).click();
  await page.getByRole('button', { name: 'Mejorar diseño', exact: true }).click();
  await page.getByLabel('Límite estimado de créditos').fill('140');
  await page.getByRole('button', { name: 'Revisar y mejorar', exact: true }).click();
  await expect(page.getByText('Preparando una mejora', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Mejora en curso', exact: true }).click();
  await expect(page.getByText('Preparando una mejora', { exact: true })).toBeVisible();
  expect(starts).toBe(1);
  await page.getByRole('button', { name: 'Cancelar mejora', exact: true }).click();
  await expect(page.getByText('Mejora cancelada', { exact: true })).toBeVisible();
  expect(cancels).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Mejorar diseño', exact: true })).toBeFocused();
  expect(starts).toBe(1);
});
