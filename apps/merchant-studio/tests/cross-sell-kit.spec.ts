import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

const kit = (name: string) => readFileSync(kitPath(`${name}`), 'utf8');
// Demo catalog only. Nothing is written to a merchant store.
const cookie = { id: 'cookie', name: 'Galleta', amount: 1800, currency: 'BOB', stock: 10, imageUrls: [] };
const milk = { id: 'milk', name: 'Leche', amount: 1000, currency: 'BOB', stock: 10, imageUrls: [] };
const mug = { id: 'mug', name: 'Taza', amount: 5000, currency: 'BOB', stock: 10, imageUrls: [], variants: [
  { id: 'white', name: 'Blanca', amount: 5000, stock: 5, options: [{ name: 'Color', value: 'Blanca' }] },
  { id: 'black', name: 'Negra', amount: 5000, stock: 5, options: [{ name: 'Color', value: 'Negra' }] },
] };
const bundles = [
  { id: 'snack', name: 'Merienda', kind: 'FIXED', items: [{ productId: 'cookie', quantity: 2 }, { productId: 'milk', quantity: 1 }], minimumQuantity: 2, discountPercent: 10 },
  { id: 'mix', name: 'Combina', kind: 'MIX_MATCH', items: [{ productId: 'cookie', quantity: 1 }, { productId: 'mug', quantity: 1 }], minimumQuantity: 3, discountPercent: 15 },
  { id: 'two', name: '2x1', kind: 'BOGO', items: [{ productId: 'cookie', quantity: 1 }, { productId: 'milk', quantity: 1 }], minimumQuantity: 2, discountPercent: 0 },
  { id: 'gift', name: 'Regalo', kind: 'FIXED', items: [{ productId: 'mug', quantity: 1 }, { productId: 'cookie', quantity: 1 }], minimumQuantity: 2, discountPercent: 5 },
  { id: 'other', name: 'Sin galleta', kind: 'FIXED', items: [{ productId: 'milk', quantity: 1 }, { productId: 'mug', quantity: 1 }], minimumQuantity: 2, discountPercent: 5 },
];

async function open(page: Page, id: string, data: Record<string, unknown>) {
  const store = { storeName: 'Prueba', shippingPickupEnabled: true, items: [cookie, milk, mug], ...data };
  await page.route('https://kit.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${kit('commerce-pages.css')}body{margin:0;font-family:Arial,sans-serif}</style></head><body class="commerce-document"><header class="commerce-header"><a href="index.html" data-store-name>Prueba</a><nav aria-label="Tienda"><button data-cart-open>Mi pedido (<span data-cart-count>0</span>)</button></nav></header><main data-pagosya-product-page></main><div data-pagosya-cart hidden></div><p data-pagosya-status></p><script>window.PAGOSYA_CONFIG=${JSON.stringify({ demo: true, slug: 'kit', productPage: 'product.html', data: store })}</script><script>${kit('commerce.js')}</script></body></html>` }));
  await page.goto(`https://kit.test/product.html?id=${id}`);
  await expect(page.locator('#pagosya-product-title')).toBeVisible();
}

test('a product page lists the bundles it belongs to and adds a fixed bundle in one tap', async ({ page }) => {
  await open(page, 'cookie', { bundlesEnabled: true, bundles });
  const offers = page.locator('.product-detail__bundles article');
  await expect(offers).toHaveCount(4);
  await expect(offers.nth(0)).toContainText('Merienda');
  await expect(offers.nth(0)).toContainText('2 × Galleta + Leche · ahorra 10%');
  await expect(offers.nth(1)).toContainText('Combina 3 o más entre Galleta y Taza · ahorra 15%');
  await expect(offers.nth(2)).toContainText('Lleva 2 entre Galleta y Leche: el de menor precio es gratis.');
  // A bundle with a product that needs choices links there instead of guessing an option.
  await expect(offers.nth(3).getByRole('button', { name: /Añadir paquete/ })).toHaveCount(0);
  await expect(offers.nth(3).getByRole('link', { name: 'Taza' })).toHaveAttribute('href', /product\.html\?id=mug/);
  await expect(offers.nth(1).getByRole('button')).toHaveCount(0);

  await offers.nth(0).getByRole('button', { name: 'Añadir paquete Merienda' }).click();
  await expect(page.locator('[data-cart-count]').first()).toHaveText('3');
  await expect(page.locator('.product-detail__status')).toHaveText('Merienda añadido a tu pedido.');
});

test('bundles stay hidden when the store has them turned off', async ({ page }) => {
  await open(page, 'cookie', { bundlesEnabled: false, bundles });
  await expect(page.locator('.product-detail__bundles')).toHaveCount(0);
});

test('the cart suggests the recommended products that are not in it yet', async ({ page }) => {
  await open(page, 'cookie', { cartRecommendationsEnabled: true, cartRecommendationProductIds: ['milk', 'mug', 'cookie'] });
  await page.locator('.product-detail__buy').click();
  await page.locator('[data-cart-open]').first().click();
  const cartPanel = page.locator('[data-pagosya-cart]').first();
  const suggestions = cartPanel.locator('.order-recommendations li');
  await expect(cartPanel.getByRole('heading', { name: 'Súmale algo más' })).toBeVisible();
  await expect(suggestions).toHaveCount(2);
  await expect(suggestions.nth(1).getByRole('link', { name: 'Elegir opciones de Taza' })).toHaveAttribute('href', /product\.html\?id=mug/);
  await suggestions.nth(0).getByRole('button', { name: 'Añadir Leche' }).click();
  await expect(page.locator('[data-cart-count]').first()).toHaveText('2');
  await expect(cartPanel.locator('.order-recommendations li')).toHaveCount(1);
});

test('the cart shows no suggestions when the owner turned them off', async ({ page }) => {
  await open(page, 'cookie', { cartRecommendationsEnabled: false, cartRecommendationProductIds: ['milk'] });
  await page.locator('.product-detail__buy').click();
  await page.locator('[data-cart-open]').first().click();
  await expect(page.locator('.order-recommendations')).toHaveCount(0);
});

test('a box on the store\'s own product page is filled cookie by cookie and goes to the cart with its picks', async ({ page }) => {
  const pick = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id: `x_${id}`, name, amount: 0, required: false, groupName: 'Sabores', freeAllowance: 0, pickCount: 4, productId: id, available: true, ...extra });
  const matcha = { id: 'matcha', name: 'Matcha', amount: 2200, currency: 'BOB', stock: 3, imageUrls: [] };
  const pistacho = { id: 'pistacho', name: 'Pistacho', amount: 2200, currency: 'BOB', stock: 10, imageUrls: [] };
  const box = { id: 'box4', name: 'Caja de 4', amount: 8000, currency: 'BOB', stock: null, imageUrls: [], extras: [pick('matcha', 'Matcha'), pick('pistacho', 'Pistacho'), pick('gone', 'Agotada', { available: false })] };
  await open(page, 'box4', { items: [box, matcha, pistacho], cartRecommendationsEnabled: true, cartRecommendationProductIds: ['matcha'] });

  const buy = page.getByRole('button', { name: /Añadir al pedido/ });
  const plus = (name: string) => page.getByRole('button', { name: `Agregar ${name}` });
  await expect(page.locator('[data-box-progress]')).toHaveText('0 de 4');
  await expect(buy).toBeDisabled();
  await expect(plus('Agotada')).toBeDisabled();
  // Only 3 Matcha are in stock, so a fourth cannot go in the box.
  for (let i = 0; i < 3; i++) await plus('Matcha').click();
  await expect(plus('Matcha')).toBeDisabled();
  await plus('Pistacho').click();
  await expect(page.locator('[data-box-progress]')).toHaveText('4 de 4');
  await expect(plus('Pistacho')).toBeDisabled();
  await page.getByRole('button', { name: 'Quitar Matcha' }).click();
  await expect(buy).toBeDisabled();
  await plus('Pistacho').click();
  await expect(buy).toBeEnabled();
  await buy.click();
  await expect(page.locator('[data-cart-count]').first()).toHaveText('1');

  await page.locator('[data-cart-open]').first().click();
  const cartPanel = page.locator('[data-pagosya-cart]').first();
  await expect(cartPanel.locator('.order-item strong')).toHaveText('Caja de 4 · Matcha ×2 · Pistacho ×2');
  const saved = await page.evaluate(() => { const detail = { items: [] as unknown[] }; document.dispatchEvent(new CustomEvent('pagosya:serialize-cart', { detail })); return detail.items; });
  expect(saved).toEqual([{ id: 'box4', extraIds: ['x_matcha', 'x_matcha', 'x_pistacho', 'x_pistacho'], quantity: 1 }]);
  // The two Matcha in the box count against the suggestion's stock too.
  await expect(cartPanel.locator('.order-recommendations li')).toHaveCount(1);
});
