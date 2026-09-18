import { test, expect } from '@playwright/test';
for (const width of [1280, 390]) test(`merchant setup explains readiness and keeps payments pending at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/?demo=1');
  await page.evaluate(async () => {
    const { renderStoreReadiness } = await import('/src/store-readiness.ts');
    document.body.innerHTML = `<main style="padding:16px;background:#fff;color:#20211d">${renderStoreReadiness({ catalog: { items: [{id:'p1',stock:3}], locations: [{pickupEnabled:true}] }, branded:true, checked:false, checking:false, published:false, canPublish:false, locked:false })}</main>`;
  });
  await page.getByText('Prepara tu primera venta', { exact: false }).click();
  await expect(page.locator('[data-readiness-step]')).toHaveCount(6);
  await expect(page.locator('[data-readiness-step=payments]')).toContainText('Integración pendiente');
  await expect(page.locator('[data-readiness-step=shipping]')).toContainText('Revisado');
  await expect(page.getByRole('button', { name: 'Publicar diseño' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Probar recorrido' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/pagosya-readiness-${width}.png`, fullPage: true });
});
test('digital delivery and incomplete catalogs are reflected without faking a test purchase', async ({ page }) => {
  await page.goto('/?demo=1');
  const steps = await page.evaluate(async () => {
    const { readinessSteps } = await import('/src/store-readiness.ts');
    return readinessSteps({ catalog:{ items:[{stock:0,fulfillmentType:'DIGITAL'}] }, branded:false, checked:false, checking:false, published:false, canPublish:false, locked:false });
  });
  expect(steps.find(s => s.id === 'products')?.done).toBe(false);
  expect(steps.find(s => s.id === 'shipping')?.done).toBe(true);
  expect(steps.find(s => s.id === 'test')?.done).toBe(false);
});
