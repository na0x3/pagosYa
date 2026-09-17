import { expect, test, type Page } from '@playwright/test';

function makeState() {
  const product = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, status: 'ACTIVE', imageUrls: [], recommendedProductIds: [] as string[], ...extra });
  return {
    store: { id: 's1', name: 'The Bake Lab', cartRecommendationsEnabled: true, cartRecommendationProductIds: ['p2'] },
    products: [
      product('p1', 'Galleta', { recommendedProductIds: ['p3'] }), product('p2', 'Leche'), product('p3', 'Taza'),
      product('p4', 'Archivada', { status: 'ARCHIVED' }), product('p5', 'Brownie'), product('p6', 'Café'), product('p7', 'Té'),
    ],
    storeCalls: [] as unknown[], productCalls: [] as Array<{ id: string; body: unknown }>,
  };
}

async function mockApi(page: Page, state: ReturnType<typeof makeState>) {
  await page.route('**/stores', route => route.request().method() === 'GET' ? route.fulfill({ json: [state.store] }) : route.continue());
  await page.route('**/stores/s1', route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const body = route.request().postDataJSON(); state.storeCalls.push(body); Object.assign(state.store, body);
    return route.fulfill({ json: state.store });
  });
  await page.route('**/stores/s1/payment_links**', route => {
    const url = new URL(route.request().url()), match = url.pathname.match(/payment_links\/([^/]+)$/);
    if (match && route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON(); state.productCalls.push({ id: match[1], body });
      const product = state.products.find(item => item.id === match[1])!; Object.assign(product, body);
      return route.fulfill({ json: product });
    }
    return route.fulfill({ json: state.products });
  });
}

async function openPanel(page: Page) {
  await page.goto('/?demo=1');
  await page.evaluate(async () => {
    const { openRecommendations } = await import('/src/recommendations.ts');
    const { MerchantStudioApi } = await import('/src/api.ts');
    await openRecommendations(new MerchantStudioApi(), 's1');
  });
}

test('owner chooses cart suggestions and what to recommend under each product', async ({ page }) => {
  const state = makeState(); await mockApi(page, state); await openPanel(page);
  const dialog = page.getByRole('dialog', { name: 'Recomendaciones' });
  await expect(dialog.getByRole('heading', { name: 'Recomendaciones' })).toBeVisible();

  const cartSection = dialog.locator('[data-cart-recommendations]');
  await expect(cartSection.getByLabel('Mostrar sugerencias en el carrito')).toBeChecked();
  await expect(cartSection.getByLabel('Leche')).toBeChecked();
  await expect(cartSection.getByLabel('Archivada')).toHaveCount(0);
  await cartSection.getByLabel('Taza').check();
  await cartSection.getByRole('button', { name: 'Guardar sugerencias del carrito' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Guardamos las sugerencias del carrito.' })).toBeVisible();
  expect(state.storeCalls).toEqual([{ cartRecommendationsEnabled: true, cartRecommendationProductIds: ['p2', 'p3'] }]);

  const productSection = dialog.locator('[data-product-recommendations]');
  await productSection.getByLabel('Producto').selectOption('p1');
  await expect(productSection.getByLabel('Galleta', { exact: true })).toHaveCount(0);
  await expect(productSection.getByLabel('Taza')).toBeChecked();
  for (const name of ['Leche', 'Brownie', 'Café']) await productSection.getByLabel(name).check();
  // Four is the most the product page shows.
  await expect(productSection.getByLabel('Té')).toBeDisabled();
  await productSection.getByRole('button', { name: 'Guardar recomendaciones' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Guardamos las recomendaciones de Galleta.' })).toBeVisible();
  expect(state.productCalls).toEqual([{ id: 'p1', body: { recommendedProductIds: ['p2', 'p3', 'p5', 'p6'] } }]);

  await expect(dialog.getByRole('button', { name: 'Paquetes y promociones' })).toBeVisible();
});
