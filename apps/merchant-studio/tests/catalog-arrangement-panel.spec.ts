import { expect, test, type Page } from '@playwright/test';

type CollectionFixture = { id: string; name: string; slug: string; sortOrder: number; productIds: string[] };

function makeState() {
  return {
    store: { id: 's1', name: 'Tienda', catalogLayout: 'sections' as string },
    products: [
      { id: 'p1', name: 'Café', status: 'ACTIVE' },
      { id: 'p2', name: 'Taza', status: 'ACTIVE' },
      { id: 'p3', name: 'Filtro', status: 'ACTIVE' },
    ],
    collections: [
      { id: 'col_summer', name: 'Verano', slug: 'verano', sortOrder: 0, productIds: [] },
      { id: 'col_sale', name: 'Rebajas', slug: 'rebajas', sortOrder: 1, productIds: [] },
    ] as CollectionFixture[],
    layoutCalls: [] as string[],
    orderCalls: [] as string[][],
    nextId: 1,
  };
}
type State = ReturnType<typeof makeState>;

async function mockStoreApi(page: Page, state: State) {
  await page.route('**/stores', route => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ json: [state.store] });
  });
  await page.route('**/stores/s1', route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const body = route.request().postDataJSON();
    state.layoutCalls.push(body.catalogLayout);
    state.store.catalogLayout = body.catalogLayout;
    return route.fulfill({ json: state.store });
  });
  await page.route('**/stores/s1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith('/payment_links')) return route.fulfill({ json: state.products });
    if (path.endsWith('/collections')) {
      if (method === 'GET') return route.fulfill({ json: state.collections });
      if (method === 'POST') {
        const body = route.request().postDataJSON();
        if (state.collections.length >= 12) return route.fulfill({ status: 400, json: { message: 'Puedes tener hasta 12 colecciones' } });
        const collection: CollectionFixture = { id: `col_${state.nextId++}`, name: body.name, slug: String(body.name).toLowerCase(), sortOrder: state.collections.length, productIds: [] };
        state.collections.push(collection);
        return route.fulfill({ json: collection });
      }
    }
    if (path.endsWith('/collections/order')) {
      const body = route.request().postDataJSON();
      state.orderCalls.push(body.collectionIds);
      const byId = new Map(state.collections.map(c => [c.id, c]));
      state.collections = body.collectionIds.map((id: string, index: number) => ({ ...byId.get(id)!, sortOrder: index }));
      return route.fulfill({ json: state.collections });
    }
    const productsMatch = path.match(/\/collections\/([^/]+)\/products$/);
    if (productsMatch) {
      const collection = state.collections.find(c => c.id === productsMatch[1]);
      if (!collection) return route.fulfill({ status: 404, json: { message: 'Collection not found' } });
      const body = route.request().postDataJSON();
      collection.productIds = body.paymentLinkIds;
      return route.fulfill({ json: collection });
    }
    const idMatch = path.match(/\/collections\/([^/]+)$/);
    if (idMatch) {
      const collection = state.collections.find(c => c.id === idMatch[1]);
      if (method === 'PATCH' && collection) {
        collection.name = route.request().postDataJSON().name;
        return route.fulfill({ json: collection });
      }
      if (method === 'DELETE') {
        state.collections = state.collections.filter(c => c.id !== idMatch[1]);
        return route.fulfill({ json: { success: true } });
      }
    }
    return route.fulfill({ json: {} });
  });
}

async function openPanel(page: Page) {
  await page.goto('/?demo=1');
  await page.evaluate(async () => {
    const { openCatalogArrangement } = await import('/src/catalog-arrangement.ts');
    const { MerchantStudioApi } = await import('/src/api.ts');
    await openCatalogArrangement(new MerchantStudioApi(), 's1');
  });
}

test('owner sees the four arrangements, switches and saves one, builds collections, assigns products to two of them, and reorders', async ({ page }) => {
  const state = makeState();
  await mockStoreApi(page, state);
  await openPanel(page);

  // All four arrangements are offered, with the store's saved choice checked.
  for (const name of ['Todo en la portada', 'Por secciones', 'Página de productos aparte', 'Una pestaña por colección']) {
    await expect(page.getByLabel(name)).toBeVisible();
  }
  await expect(page.getByLabel('Por secciones')).toBeChecked();
  await expect(page.getByLabel('Todo en la portada')).not.toBeChecked();

  // Choosing a different arrangement and saving sends catalogLayout.
  await page.getByLabel('Todo en la portada').check();
  await page.getByRole('button', { name: 'Guardar arreglo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Guardamos' })).toBeVisible();
  expect(state.layoutCalls).toEqual(['all']);

  // Creating a collection sends the name and lists it.
  await page.getByLabel('Nombre de la nueva colección').fill('Invierno');
  await page.getByRole('button', { name: 'Crear colección' }).click();
  await expect(page.locator('[data-collection="col_1"]').getByLabel('Nombre de la colección')).toHaveValue('Invierno');
  expect(state.collections.map(c => c.name)).toEqual(['Verano', 'Rebajas', 'Invierno']);

  // Adding a product to two collections does not remove it from the first.
  const summer = page.locator('[data-collection="col_summer"]');
  const sale = page.locator('[data-collection="col_sale"]');
  await summer.getByLabel('Café').check();
  await summer.getByRole('button', { name: 'Guardar productos' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Productos actualizados' })).toBeVisible();
  expect(state.collections.find(c => c.id === 'col_summer')!.productIds).toEqual(['p1']);

  await sale.getByLabel('Café').check();
  await sale.getByRole('button', { name: 'Guardar productos' }).click();
  expect(state.collections.find(c => c.id === 'col_sale')!.productIds).toEqual(['p1']);
  expect(state.collections.find(c => c.id === 'col_summer')!.productIds).toEqual(['p1']);

  // Removing a product updates the list.
  await summer.getByLabel('Café').uncheck();
  await summer.getByRole('button', { name: 'Guardar productos' }).click();
  expect(state.collections.find(c => c.id === 'col_summer')!.productIds).toEqual([]);

  // Reordering sends the store's complete collection id set, not a partial one.
  await summer.getByRole('button', { name: 'Bajar Verano' }).click();
  expect(state.orderCalls.at(-1)).toEqual(['col_sale', 'col_summer', 'col_1']);
});

test('a failed save shows the server message and keeps what the owner typed', async ({ page }) => {
  const state = makeState();
  state.collections = Array.from({ length: 12 }, (_, i) => ({ id: `col_${i}`, name: `Colección ${i}`, slug: `coleccion-${i}`, sortOrder: i, productIds: [] }));
  await mockStoreApi(page, state);
  await openPanel(page);

  await page.getByLabel('Nombre de la nueva colección').fill('Colección extra');
  await page.getByRole('button', { name: 'Crear colección' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Puedes tener hasta 12 colecciones' })).toBeVisible();
  await expect(page.getByLabel('Nombre de la nueva colección')).toHaveValue('Colección extra');
});

test('saving a collection never drops a product with no checkbox in the picker', async ({ page }) => {
  const state = makeState();
  // "ghost" is in the collection's membership but absent from the products
  // payload entirely (e.g. archived or otherwise excluded) — it must still
  // survive a save that only touches a different, known product.
  state.collections = [{ id: 'col_summer', name: 'Verano', slug: 'verano', sortOrder: 0, productIds: ['ghost', 'p1'] }];
  await mockStoreApi(page, state);
  await openPanel(page);

  const summer = page.locator('[data-collection="col_summer"]');
  await expect(summer.locator('.arrangement-product-inactive')).toContainText('Producto no disponible');

  await summer.getByLabel('Taza').check();
  await summer.getByRole('button', { name: 'Guardar productos' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Productos actualizados' })).toBeVisible();

  const saved = state.collections.find(c => c.id === 'col_summer')!.productIds;
  expect(saved).toContain('ghost');
  expect(saved).toContain('p1');
  expect(saved).toContain('p2');
});

test('reordering two products in a collection submits the new order', async ({ page }) => {
  const state = makeState();
  state.collections = [{ id: 'col_summer', name: 'Verano', slug: 'verano', sortOrder: 0, productIds: ['p1', 'p2', 'p3'] }];
  await mockStoreApi(page, state);
  await openPanel(page);

  const summer = page.locator('[data-collection="col_summer"]');
  await summer.getByRole('button', { name: 'Bajar Café' }).click();
  await summer.getByRole('button', { name: 'Guardar productos' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Productos actualizados' })).toBeVisible();
  expect(state.collections.find(c => c.id === 'col_summer')!.productIds).toEqual(['p2', 'p1', 'p3']);
});

test('saving without reordering keeps the collection\'s existing product order, not catalog order', async ({ page }) => {
  const state = makeState();
  // Deliberately out of catalog order (p1, p2, p3). A save built from
  // checkbox DOM order (catalog order) instead of the collection's own order
  // would silently resort these back to p1, p2, p3 — the destructive bug.
  state.collections = [{ id: 'col_summer', name: 'Verano', slug: 'verano', sortOrder: 0, productIds: ['p3', 'p1', 'p2'] }];
  await mockStoreApi(page, state);
  await openPanel(page);

  const summer = page.locator('[data-collection="col_summer"]');
  await summer.getByRole('button', { name: 'Guardar productos' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Productos actualizados' })).toBeVisible();
  expect(state.collections.find(c => c.id === 'col_summer')!.productIds).toEqual(['p3', 'p1', 'p2']);
});

test('archived products in a collection stay checked, greyed, and survive a save', async ({ page }) => {
  const state = makeState();
  state.products = [...state.products, { id: 'p4', name: 'Descontinuado', status: 'ARCHIVED' }];
  state.collections = [{ id: 'col_summer', name: 'Verano', slug: 'verano', sortOrder: 0, productIds: ['p4', 'p1'] }];
  await mockStoreApi(page, state);
  await openPanel(page);

  const summer = page.locator('[data-collection="col_summer"]');
  await expect(summer.locator('.arrangement-product-inactive')).toContainText('Descontinuado (archivado)');
  await expect(summer.getByLabel('Descontinuado (archivado)')).toBeChecked();

  // Saving must not silently drop the archived product even though it isn't
  // the one being touched.
  await summer.getByRole('button', { name: 'Guardar productos' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Productos actualizados' })).toBeVisible();
  expect(state.collections.find(c => c.id === 'col_summer')!.productIds).toEqual(['p4', 'p1']);
});

test('deleting a collection removes it from the next reorder call, which still sends every survivor', async ({ page }) => {
  const state = makeState();
  state.collections = [
    { id: 'col_summer', name: 'Verano', slug: 'verano', sortOrder: 0, productIds: [] },
    { id: 'col_sale', name: 'Rebajas', slug: 'rebajas', sortOrder: 1, productIds: [] },
    { id: 'col_winter', name: 'Invierno', slug: 'invierno', sortOrder: 2, productIds: [] },
  ];
  await mockStoreApi(page, state);
  await openPanel(page);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-collection="col_sale"]').getByRole('button', { name: 'Eliminar colección' }).click();
  await expect(page.locator('[data-collection="col_sale"]')).toHaveCount(0);
  expect(state.collections.map(c => c.id)).toEqual(['col_summer', 'col_winter']);

  await page.locator('[data-collection="col_winter"]').getByRole('button', { name: 'Subir Invierno' }).click();
  expect(state.orderCalls.at(-1)).toEqual(['col_winter', 'col_summer']);
});
