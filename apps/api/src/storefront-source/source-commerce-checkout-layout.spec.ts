import { kitDefaultSnapshot, parseConfig } from './source-scorecard-capture';
import { withVisualSandbox } from './source-visual-capture';

jest.setTimeout(90_000);
// 2026-10-12: a photo-less line on checkout.html turned its body into one flex row (head, unit, stock and quantity side by
// side), so at phone width the product name broke one letter per line and the row pushed the page sideways at 320px.
it.each([
  [320, ''], [390, ''],
  // Ramo Ramón and Ficha Arcade (2026-10-12): authored CSS that assumes a photo column put the text in the 78px column.
  [320, '.order-item{display:grid;grid-template-columns:78px 1fr;gap:13px}'],
])('keeps a photo-less checkout row readable at %ipx %s', async (width, authoredCss) => {
  const snapshot = await kitDefaultSnapshot();
  const config = parseConfig(snapshot);
  config.data.items = [{ ...config.data.items[0], name: 'Cuaderno de planificación semanal con tapa azul — edición de escritorio', imageUrls: [], amount: 4950, stock: 2 }];
  if (authoredCss) { const styles = snapshot.files.find(file => file.path === 'styles.css'); if (styles) styles.content += `\n${authoredCss}\n`; else snapshot.files.push({ path: 'styles.css', content: authoredCss, encoding: 'utf8' }); }
  snapshot.files.find(file => file.path === 'config.js')!.content = `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};`;
  await withVisualSandbox(snapshot, '', undefined, true, async context => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 844 });
    await page.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
    await page.locator('[data-pagosya-catalog] [data-add]').first().click();
    await page.locator('[data-pagosya-catalog] [data-add]').first().click();
    await page.goto('https://preview.invalid/checkout.html', { waitUntil: 'load' });
    const body = page.locator('[data-pagosya-checkout] .order-item__body').first();
    await body.waitFor();
    const facts = await body.evaluate(el => {
      const name = el.querySelector('.order-item__head > strong')!.getBoundingClientRect();
      const unit = el.querySelector('.order-item__unit')!.getBoundingClientRect();
      const quantity = el.querySelector('.quantity')!.getBoundingClientRect();
      const head = el.querySelector('.order-item__head')!.getBoundingClientRect();
      return { display: getComputedStyle(el).display, nameWide: name.width >= 120, unitBelowName: unit.top >= head.bottom, quantityBelowUnit: quantity.top >= unit.bottom,
        pageFits: document.documentElement.scrollWidth <= window.innerWidth };
    });
    expect(facts).toEqual({ display: 'block', nameWide: true, unitBelowName: true, quantityBelowUnit: true, pageFits: true });
    await page.close();
  });
});
