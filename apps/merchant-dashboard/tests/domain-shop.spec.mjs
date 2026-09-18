import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function fixture(page) {
  await page.route('**/src/domain-shop.mjs', route => readFile(new URL('../src/domain-shop.mjs', import.meta.url), 'utf8').then(body => route.fulfill({ contentType: 'text/javascript', body })));
  await page.route('**/src/domain-shop.css', route => readFile(new URL('../src/domain-shop.css', import.meta.url), 'utf8').then(body => route.fulfill({ contentType: 'text/css', body })));
  await page.route('**/domain-shop-fixture', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/domain-shop.css"><style>*{box-sizing:border-box}body{font-family:Arial;max-width:920px;margin:20px auto;padding:12px}button{padding:10px;cursor:pointer}</style><section id="shop" class="domain-shop"></section><script type="module">
    import {mountDomainShop} from '/src/domain-shop.mjs';
    window.calls=[]; window.orders=[]; window.failSave=false;
    window.shop=mountDomainShop(document.getElementById('shop'),{onConnected:()=>{},onSupport:()=>{},api:async(path,options={})=>{
      const body=options.body?JSON.parse(options.body):null; window.calls.push({path,body});
      if(path.endsWith('/search')) return [{hostname:'mitienda.com',available:true,amount:12000,renewalAmount:14000,currency:'BOB'},{hostname:'mitienda.net',available:false}];
      if(path.endsWith('/quotes')) return {id:'quote-1',hostname:'mitienda.com',amount:12000,renewalAmount:14000,currency:'BOB'};
      if(path.endsWith('/checkout')) {if(window.failSave) throw new Error('No se pudo preparar el pago. Reintenta.'); window.orders=[{id:'order-1',hostname:'mitienda.com',status:'AWAITING_PAYMENT',amount:12000,currency:'BOB',checkoutUrl:'https://checkout.example.test/#client_secret=test'}];return window.orders[0];}
      return {available:true,sandbox:false,orders:window.orders};
    }});window.shop.setStore('store-1');
  </script>` }));
  await page.goto('/domain-shop-fixture');
  await expect(page.getByRole('button', { name: 'Buscar dominio' })).toBeVisible();
}
async function choose(page) {
  await page.getByLabel('Nombre de tu dominio').fill('mitienda');
  await page.getByRole('button', { name: 'Buscar dominio' }).click();
  await expect(page.getByRole('button', { name: 'No disponible', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Elegir' }).click();
  await expect(page.getByText('Se registrará a nombre')).toBeVisible();
}
test('reviews ownership and price, preserves failed checkout data, and resumes payment', async ({ page }) => {
  await fixture(page); await choose(page);
  const values = { firstName: 'Ana', lastName: 'Perez', email: 'ana@example.test', phone: '+59170000000', address1: 'Calle 123', city: 'La Paz', state: 'La Paz', zip: '0000', country: 'BO' };
  for (const [name, value] of Object.entries(values)) await page.locator(`[name="${name}"]`).fill(value);
  expect(await page.evaluate(() => window.calls.filter(c => c.path.endsWith('/checkout')).length)).toBe(0);
  await page.getByRole('checkbox').check();
  await page.evaluate(() => { window.failSave = true; });
  await page.getByRole('button', { name: /Continuar al pago/ }).click();
  await expect(page.getByText('No se pudo preparar el pago. Reintenta.')).toBeVisible();
  await expect(page.locator('[name=email]')).toHaveValue('ana@example.test');
  await page.evaluate(() => { window.failSave = false; });
  await page.getByRole('button', { name: /Continuar al pago/ }).click();
  await expect(page.getByRole('link', { name: /Pagar/ })).toHaveAttribute('href', 'https://checkout.example.test/#client_secret=test');
  expect((await page.evaluate(() => window.calls.filter(c => c.path.endsWith('/checkout'))))[0].body).toEqual({ quoteId: 'quote-1', registrant: values, accepted: true });
});
test('keeps drafts scoped to their store and fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page); await choose(page);
  await page.locator('[name=firstName]').fill('Ana');
  await page.evaluate(() => window.shop.setStore('store-2'));
  await expect(page.locator('[data-checkout]')).toHaveCount(0);
  await expect(page.locator('[name=query]')).toHaveValue('');
  await page.evaluate(() => window.shop.setStore('store-1'));
  await expect(page.locator('[name=firstName]')).toHaveValue('Ana');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/pagosya-domain-shop-phone.png', fullPage: true });
});
