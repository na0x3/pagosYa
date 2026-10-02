import { kitDefaultSnapshot, parseConfig } from './source-scorecard-capture';
import { withVisualSandbox } from './source-visual-capture';

jest.setTimeout(60_000);
it('keeps a long-name mobile cart row readable with unit prices and quantity controls', async () => {
  const snapshot = await kitDefaultSnapshot();
  const config = parseConfig(snapshot);
  config.data.items = [{ ...config.data.items[0], name: 'Cuaderno de planificación semanal con tapa azul — edición de escritorio', imageUrls: [], amount: 4950, stock: 2 }];
  snapshot.files.find(file => file.path === 'config.js')!.content = `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};`;
  await withVisualSandbox(snapshot, '', undefined, true, async context => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
    await page.locator('[data-pagosya-catalog] [data-add]').first().click();
    await page.locator('[data-pagosya-catalog] [data-add]').first().click();
    await page.locator('body > header [data-cart-open]').click();
    await page.locator('.cart-drawer[open]').waitFor();
    const facts = await page.locator('.cart-drawer .order-item__body').evaluate(el => {
      const unit = el.querySelector('.order-item__unit')!.getBoundingClientRect();
      const quantity = el.querySelector('.quantity')!.getBoundingClientRect();
      const head = el.querySelector('.order-item__head')!.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return { display: getComputedStyle(el).display, unitBelowName: unit.top >= head.bottom, quantityBelowUnit: quantity.top >= unit.bottom,
        unitFits: unit.right <= rect.right + 1, text: el.textContent };
    });
    expect(facts).toMatchObject({ display: 'block', unitBelowName: true, quantityBelowUnit: true, unitFits: true });
    expect(facts.text).toContain('49,50');
    expect(await page.locator('.cart-drawer [data-add]').isDisabled()).toBe(true);
    await page.close();
  });
});
