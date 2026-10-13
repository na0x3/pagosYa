import { expect, test } from '@playwright/test';

const base = { slug: 'tienda', status: 'ACTIVE', websiteRevision: 0, links: [], locations: [], animations: [], heroSlides: [], editorialGallery: [], contentOrder: ['hero', 'products'], checkoutMode: 'pagosya' };
const DOMAIN = 'Archiva esta tienda para conservar el registro y los pagos de sus dominios.';

async function account(page) {
  let stores = [{ ...base, id: 'uno', name: 'Uno', slug: 'uno' }, { ...base, id: 'dos', name: 'Dos', slug: 'dos' }, { ...base, id: 'tres', name: 'Tres', slug: 'tres' }];
  const requests = [];
  await page.addInitScript(() => {
    sessionStorage.setItem('pagosya_merchant_session', 'bulk-delete-test');
    sessionStorage.setItem('pagosya_merchant_email', 'bulk@example.test');
  });
  await page.route('http://localhost:3001/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname.slice(3), method = req.method();
    requests.push(`${method} ${path}`);
    let body = [], status = 200;
    const deleting = path.match(/^\/stores\/([^/]+)$/);
    const archiving = path.match(/^\/stores\/([^/]+)\/archive$/);
    if (path === '/stores') body = stores;
    else if (deleting && method === 'DELETE') {
      // A store with a domain is refused, exactly as the API does.
      if (deleting[1] === 'dos') { status = 400; body = { statusCode: 400, message: DOMAIN }; }
      else { stores = stores.filter(store => store.id !== deleting[1]); body = { success: true }; }
    } else if (archiving && method === 'POST') { stores = stores.map(store => store.id === archiving[1] ? { ...store, status: 'ARCHIVED' } : store); body = { success: true }; }
    else if (path.endsWith('/source-project')) body = { revision: 0, versions: [], nextBefore: null };
    else if (path.endsWith('/conversation')) body = { messages: [], setup: { step: 'business', prompt: '¿Qué vendes?', options: [] } };
    else if (path.endsWith('/catalog')) body = { storeName: 'Uno', items: [], categories: [] };
    else if (path.endsWith('/visual-studio')) body = { proposals: [], versions: [] };
    else if (path === '/merchants/balance') body = { payableBalance: 0 };
    else if (path === '/merchants/kyc') body = { status: 'APPROVED' };
    else if (path === '/merchants/invoicing_profile') body = { status: 'NOT_CONFIGURED' };
    else if (path === '/merchants/finances') body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: 'BOB' };
    else if (path === '/auth/google') body = { enabled: false };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/#dashboard-stores');
  await expect(page.locator('#storeRows')).toContainText('Tres');
  return requests;
}

test('several stores are deleted at once; a refused one is listed with its reason and can be archived', async ({ page }) => {
  const requests = await account(page);
  await page.getByRole('button', { name: 'Seleccionar', exact: true }).click();
  await expect(page.locator('#storeBulkBar')).toBeVisible();
  for (const name of ['Uno', 'Dos', 'Tres']) await page.getByRole('checkbox', { name: `Seleccionar ${name}` }).check();
  await expect(page.locator('#storeBulkCount')).toHaveText('3 seleccionadas');
  await page.locator('#storeBulkDelete').click();

  const dialog = page.locator('#storeBulkDeleteDialog');
  await expect(dialog.getByRole('heading')).toHaveText('Eliminar 3 tiendas');
  await expect(dialog.locator('#storeBulkDeleteNames li')).toHaveText(['Uno', 'Dos', 'Tres']);
  const confirm = dialog.locator('#storeBulkDeleteConfirm');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Escribe ELIMINAR para confirmar').fill('eliminar');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Escribe ELIMINAR para confirmar').fill('ELIMINAR');
  await confirm.click();

  await expect(dialog.locator('#storeBulkDeleteStatus')).toHaveText('Se eliminaron 2 · 1 no se eliminó');
  await expect(dialog.locator('.store-bulk-skipped li')).toHaveText([`Dos${DOMAIN}`]);
  expect(requests.filter(line => line.startsWith('DELETE'))).toEqual(['DELETE /stores/uno', 'DELETE /stores/dos', 'DELETE /stores/tres']);
  await dialog.getByRole('button', { name: 'Archivar estas' }).click();
  await expect(dialog.locator('#storeBulkDeleteStatus')).toHaveText('Se eliminaron 2 · 1 no se eliminó · archivadas');
  expect(requests).toContain('POST /stores/dos/archive');

  await dialog.locator('.account-delete-actions').getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.locator('#storeRows .store-row')).toHaveCount(1);
  await expect(page.locator('#storeRows')).toContainText('Dos');
  await expect(page.locator('#storeBulkBar')).toBeHidden();
});

test('select all takes only the stores the search shows, and one store needs no typed word', async ({ page }) => {
  await account(page);
  await page.locator('#storeLibrarySearch').fill('Tres');
  await page.getByRole('button', { name: 'Seleccionar', exact: true }).click();
  await page.getByRole('button', { name: 'Seleccionar todas' }).click();
  await expect(page.locator('#storeBulkCount')).toHaveText('1 seleccionada');
  await page.locator('#storeBulkDelete').click();
  const dialog = page.locator('#storeBulkDeleteDialog');
  await expect(dialog.getByLabel('Escribe ELIMINAR para confirmar')).toBeHidden();
  await expect(dialog.locator('#storeBulkDeleteConfirm')).toBeEnabled();
  await dialog.locator('#storeBulkDeleteConfirm').click();
  await expect(dialog).toBeHidden();
  await page.locator('#storeLibrarySearch').fill('');
  await expect(page.locator('#storeRows .store-row')).toHaveCount(2);
});

test('while selecting, clicking a card selects it instead of opening it, and Cancelar leaves selection mode', async ({ page }) => {
  await account(page);
  await page.getByRole('button', { name: 'Seleccionar', exact: true }).click();
  await page.locator('.store-row[data-id="uno"] .store-card-preview').click();
  await expect(page.locator('#storeBulkCount')).toHaveText('1 seleccionada');
  await expect(page).toHaveURL(/#dashboard-stores$/);
  await page.locator('#storeBulkCancel').click();
  await expect(page.locator('#storeBulkBar')).toBeHidden();
  await expect(page.locator('.store-select')).toHaveCount(0);
});
