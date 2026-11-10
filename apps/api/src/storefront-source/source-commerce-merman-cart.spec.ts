import { kitDefaultSnapshot, parseConfig } from './source-scorecard-capture';
import { withVisualSandbox } from './source-visual-capture';

/** Spec 2026-11-09 Merman cart + checkout: the free-shipping bar, savings, per-line frequency, «Pagar • total» and the guarantee line. */
jest.setTimeout(90_000);
const mug = { id: 'mug', name: 'Taza de barro', amount: 9000, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [] };
const coffee = { id: 'coffee', name: 'Café de altura', amount: 7500, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [], subscriptionOptions: [{ cadence: 'MONTHLY', discountPercent: 10, label: null }] };

async function cartPage(data: Record<string, unknown>, width: number, run: (page: import('playwright').Page) => Promise<void>, templates = '') {
  const snapshot = await kitDefaultSnapshot();
  if (templates) { const index = snapshot.files.find(file => file.path === 'index.html')!; index.content = index.content.replace('</body>', `${templates}</body>`); }
  const config = parseConfig(snapshot);
  Object.assign(config.data, { checkoutMode: 'payment', subscriptionsEnabled: true, items: [mug, coffee], ...data });
  snapshot.files.find(file => file.path === 'config.js')!.content = `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};`;
  await withVisualSandbox(snapshot, '', undefined, true, async context => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    await page.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
    await run(page);
    await page.close();
  });
}
const open = async (page: import('playwright').Page) => { await page.locator('body > header [data-cart-open]').click(); await page.locator('.cart-drawer[open]').waitFor(); };
const add = (page: import('playwright').Page, id: string) => page.locator(`[data-pagosya-catalog] [data-add="${id}"]`).first().click();

for (const width of [390, 1280]) {
  it(`at ${width}: the bar counts down to free shipping, then celebrates; the pay button shows the total; the guarantee is the store's`, async () => {
    await cartPage({ freeShippingFrom: 20000, policies: { returns: 'Si no te gusta, te devolvemos tu dinero en 30 días. Escríbenos.' } }, width, async page => {
      await add(page, 'mug');
      await open(page);
      const bar = page.locator('.cart-drawer [data-part="cart-free-shipping"]');
      expect(await bar.textContent()).toMatch(/Te faltan .*110.* para envío gratis/);
      const facts = await bar.evaluate(el => {
        const fill = el.querySelector('.cart-free__track span') as HTMLElement;
        return { fill: fill.getBoundingClientRect().width / (fill.parentElement as HTMLElement).getBoundingClientRect().width, painted: getComputedStyle(fill).backgroundColor !== 'rgba(0, 0, 0, 0)', truck: (el.querySelector('.cart-free__truck') as Element).getBoundingClientRect().width > 0, font: parseFloat(getComputedStyle(el.querySelector('p')!).fontSize) };
      });
      expect(facts.fill).toBeGreaterThan(0.4); expect(facts.fill).toBeLessThan(0.5);
      expect(facts).toMatchObject({ painted: true, truck: true });
      expect(facts.font).toBeGreaterThanOrEqual(12);
      expect(await page.locator('.cart-drawer .checkout-button').textContent()).toMatch(/Pagar • .*90/);
      expect(await page.locator('.cart-drawer [data-part="cart-guarantee"]').textContent()).toBe('Si no te gusta, te devolvemos tu dinero en 30 días.');
      await page.locator('.cart-drawer [data-add="mug"]').click();
      await page.locator('.cart-drawer [data-add="mug"]').click();
      expect(await bar.textContent()).toBe('¡Tienes envío gratis!');
    });
  });
}

it('no free-shipping amount → no bar; no returns policy → pagosYa\'s guarantee', async () => {
  await cartPage({}, 390, async page => {
    await add(page, 'mug');
    await open(page);
    expect(await page.locator('.cart-drawer [data-part="cart-free-shipping"]').count()).toBe(0);
    expect(await page.locator('.cart-drawer [data-part="cart-guarantee"]').textContent()).toBe('Compra segura · Pagos protegidos por pagosYa');
  });
});

it('a subscription product gets its frequency choice in the cart; changing it reprices the line in place and shows the saving', async () => {
  await cartPage({}, 390, async page => {
    await add(page, 'mug');
    await add(page, 'coffee');
    await open(page);
    expect(await page.locator('.cart-drawer [data-cart-cadence]').count()).toBe(1);
    const select = page.locator('.cart-drawer [data-cart-cadence]');
    expect(await select.locator('option').allTextContents()).toEqual(['Una vez', 'Suscripción · cada mes (ahorra 10 %)']);
    await select.selectOption('MONTHLY');
    const line = page.locator('.cart-drawer [data-part="cart-line"]').nth(1);
    await line.locator('[data-part="cart-line-save"]').waitFor();
    expect(await line.textContent()).toContain('67,50');
    expect(await line.locator('[data-part="cart-line-save"]').textContent()).toMatch(/\(Ahorras .*7,50\)/);
    const save = await line.locator('[data-part="cart-line-save"]').evaluate(el => ({ font: parseFloat(getComputedStyle(el).fontSize), colour: getComputedStyle(el).color, text: getComputedStyle(el.closest('.order-item')!).color }));
    expect(save.font).toBeGreaterThanOrEqual(12);
    expect(save.colour).not.toBe(save.text);
    expect(await page.locator('.cart-drawer [data-cart-cadence]').inputValue()).toBe('MONTHLY');
  });
});

// Live Vórtice 2026-11-09: template stores carry Tailwind's reset (unlayered), which beats the kit's layered cart styles.
const PREFLIGHT = '<style>*,::before,::after{border:0 solid}button{background-color:transparent;background-image:none;border-radius:0;color:inherit}</style>';
it('«Te puede gustar» suggests what is not in the cart, adds it with one tap, and leaves when there is nothing left to suggest', async () => {
  await cartPage({}, 390, async page => {
    await add(page, 'mug');
    await open(page);
    const row = page.locator('.cart-drawer [data-part="cart-suggestions"]');
    expect(await row.locator('h3').textContent()).toBe('Te puede gustar');
    expect(await row.textContent()).toContain('Café de altura');
    expect(await row.textContent()).not.toContain('Taza de barro');
    // Owner 2026-11-09 (Remolino): «Añadir» was plain text beside a filled «Elegir» — both are pills in the pay button's colour.
    const look = await page.evaluate(() => {
      const style = (el: Element | null) => el ? getComputedStyle(el) : null;
      const pick = style(document.querySelector('.cart-drawer [data-part="cart-suggestions"] [data-add]')), pay = style(document.querySelector('.cart-drawer .checkout-button'));
      return { round: parseFloat(pick!.borderTopLeftRadius) >= 18, filled: pick!.backgroundColor !== 'rgba(0, 0, 0, 0)' && pick!.backgroundColor !== pay!.color, readable: pick!.color !== pick!.backgroundColor };
    });
    expect(look).toEqual({ round: true, filled: true, readable: true });
    await row.locator('[data-add]').first().click();
    await page.locator('.cart-drawer [data-part="cart-line"]').nth(1).waitFor();
    expect(await page.locator('.cart-drawer [data-part="cart-suggestions"]').count()).toBe(0);
  }, PREFLIGHT);
});

// Live Remolino 2026-11-09: a store with its own cart and line templates lost the bar (pushed under the button) and the line extras.
const TEMPLATES = '<template data-pagosya-cart-template><div class="shop-cart"><button data-cart-close>×</button><div data-cart-slot="lines"></div><div data-cart-slot="total"></div><div data-cart-slot="action"></div></div></template>'
  + '<template data-pagosya-cart-line-template><li><img data-cart-field="photo"><strong data-cart-field="name"></strong><span data-cart-field="line-total"></span><div data-cart-field="quantity"></div></li></template>';
it('a store with its own cart templates keeps the bar above the lines and the saving and frequency on each line', async () => {
  await cartPage({ freeShippingFrom: 20000 }, 390, async page => {
    await add(page, 'coffee');
    await open(page);
    const facts = await page.evaluate(() => {
      const bar = document.querySelector('.cart-drawer [data-part="cart-free-shipping"]');
      const lines = document.querySelector('.cart-drawer .order-items');
      return { bar: Boolean(bar), barAbove: Boolean(bar && lines && (bar.compareDocumentPosition(lines) & Node.DOCUMENT_POSITION_FOLLOWING)), cadence: document.querySelectorAll('.cart-drawer .order-item [data-cart-cadence]').length };
    });
    expect(facts).toEqual({ bar: true, barAbove: true, cadence: 1 });
    await page.locator('.cart-drawer [data-cart-cadence]').selectOption('MONTHLY');
    await page.locator('.cart-drawer .order-item [data-part="cart-line-save"]').waitFor();
    expect(await page.locator('.cart-drawer .order-item [data-cart-cadence]').inputValue()).toBe('MONTHLY');
  }, TEMPLATES);
});

// Final review 2026-11-09: a membership's «Añadir» did nothing (it has its own join flow); a digital-only cart ships nothing.
it('never suggests a membership, and a digital-only cart shows no free-shipping bar', async () => {
  const club = { id: 'club', name: 'Club de recetas', amount: 3000, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [], fulfillmentType: 'MEMBERSHIP', membershipPeriods: [{ id: 'm1', months: 1, amount: 3000 }] };
  const ebook = { id: 'ebook', name: 'Recetario PDF', amount: 4000, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [], fulfillmentType: 'DIGITAL' };
  await cartPage({ items: [mug, club, ebook], freeShippingFrom: 20000 }, 390, async page => {
    await add(page, 'ebook');
    await open(page);
    expect(await page.locator('.cart-drawer [data-part="cart-free-shipping"]').count()).toBe(0);
    expect(await page.locator('.cart-drawer [data-part="cart-suggestions"]').textContent()).not.toContain('Club de recetas');
  });
});
