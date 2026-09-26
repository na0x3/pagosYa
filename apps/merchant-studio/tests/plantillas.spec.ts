import { expect, test } from '@playwright/test';

const templates = [
  { id: 'aurora', name: 'Aurora', category: 'belleza', description: 'Cosmética y cuidado personal.', tags: [], order: 10 },
  { id: 'cumbre', name: 'Cumbre', category: 'deporte', description: 'Aire libre.', tags: [], order: 20 },
];

test('a store without a site picks a Plantilla from the empty state and applies it', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const applied: any[] = [];
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname; const method = route.request().method(); let body: any = {};
    if (path.endsWith('/stores')) body = [{ id: 's1', slug: 'cafe', name: 'Café de prueba' }];
    else if (path.endsWith('/store-templates')) body = templates;
    else if (path.includes('/source-project/templates/') && method === 'POST') { applied.push({ path, body: route.request().postDataJSON() }); body = { revision: 1, label: 'Plantilla: Aurora', createdAt: new Date().toISOString(), restoredFrom: null }; }
    else if (path.endsWith('/source-project')) body = { revision: 0, versions: [], nextBefore: null };
    else if (path.endsWith('/conversation')) body = { messages: [] };
    else if (path.endsWith('/estimate')) body = { model: 'gpt-5.6-terra', maxCredits: 50, estimate: { minCredits: 4, maxCredits: 16 } };
    await route.fulfill({ json: body });
  });
  await page.goto('/?source=1');
  await page.getByRole('button', { name: 'Elegir una plantilla' }).click();
  const dialog = page.getByRole('dialog', { name: 'Plantillas' });
  await expect(dialog.getByRole('heading', { name: 'Plantillas' })).toBeVisible();
  await expect(dialog.locator('[data-template-card]')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Deporte y aire libre' }).click();
  await expect(dialog.locator('[data-template-card]')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Todas' }).click();
  await page.screenshot({ path: '.test-artifacts/plantillas-desktop.png' });
  await dialog.getByRole('button', { name: 'Ver Aurora' }).click();
  await expect(dialog.locator('[data-template-confirm]')).toContainText('Tu tienda tomará este diseño');
  await expect(dialog.locator('[data-template-confirm]')).not.toContainText('historial');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.test-artifacts/plantillas-mobile.png' });
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await dialog.getByRole('button', { name: 'Usar Aurora' }).click();
  await expect(dialog).toHaveCount(0);
  expect(applied).toEqual([{ path: '/api/v1/stores/s1/source-project/templates/aurora', body: { revision: 0 } }]);
  expect(errors).toEqual([]);
});
