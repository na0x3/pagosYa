import { kitDefaultSnapshot, parseConfig } from './source-scorecard-capture';
import { withVisualSandbox } from './source-visual-capture';

/** Spec 2026-11-09 Merman cart + checkout: the photo band, the dark summary column, three trust lines, one suggestion and a real review. */
jest.setTimeout(120_000);
const mug = { id: 'mug', name: 'Taza de barro', amount: 9000, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [] };
const coffee = { id: 'coffee', name: 'Café de altura', amount: 7500, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [] };
const review = { name: 'Lucía M.', rating: 5, body: 'La taza llegó perfecta y el café es el mejor que probé en La Paz, ya pedí otra.', productName: 'Taza de barro' };
const policies = { returns: 'Si no te gusta, te devolvemos tu dinero en 30 días. Escríbenos.', delivery: 'Entregamos en 24 horas en La Paz.' };

async function checkout(data: Record<string, unknown>, width: number, css: string, run: (page: import('playwright').Page) => Promise<void>) {
  const snapshot = await kitDefaultSnapshot();
  const config = parseConfig(snapshot);
  Object.assign(config.data, { checkoutMode: 'payment', items: [mug, coffee], policies, ...data });
  if (css) { const styles = snapshot.files.find(file => file.path === 'styles.css'); if (styles) styles.content += `\n${css}\n`; else snapshot.files.push({ path: 'styles.css', content: css, encoding: 'utf8' } as never); }
  snapshot.files.find(file => file.path === 'config.js')!.content = `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};`;
  await withVisualSandbox(snapshot, '', undefined, true, async context => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    await page.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
    await page.locator('[data-pagosya-catalog] [data-add="mug"]').first().click();
    await page.goto('https://preview.invalid/checkout.html', { waitUntil: 'load' });
    await page.locator('.pya-checkout .pya-co__summary').waitFor({ state: 'attached' });
    await run(page);
    await page.close();
  });
}
const lum = (rgb: string) => { const [r, g, b] = (rgb.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

it.each([['', 'a store with dark text'], ['body{color:#e8e2d6;background:#fbf8f2}', 'a store whose text colour is light']])('at 1280 %s: the photo band, the form left and the dark summary right (%s)', async (css) => {
  await checkout({ checkoutReview: review }, 1280, css, async page => {
    const facts = await page.evaluate(() => {
      const band = document.querySelector('.pya-checkout [data-part="checkout-band"]') as HTMLElement;
      const main = document.querySelector('.pya-checkout .pya-co__main')!.getBoundingClientRect();
      const summary = document.querySelector('.pya-checkout .pya-co__summary') as HTMLElement;
      const box = summary.getBoundingClientRect(), style = getComputedStyle(summary);
      const title = summary.querySelector('.pya-co__title') as HTMLElement;
      return { band: band ? band.getBoundingClientRect().height : 0, right: box.left >= main.right - 1, bg: style.backgroundColor, ink: getComputedStyle(title).color };
    });
    expect(facts.band).toBeGreaterThanOrEqual(96);
    expect(facts.right).toBe(true);
    expect(lum(facts.bg)).toBeLessThan(0.2);
    expect(contrast(facts.bg, facts.ink)).toBeGreaterThanOrEqual(4.5);
  });
});

it('three trust lines in the store\'s words; one «Completa tu compra»; the review card from a real review only', async () => {
  await checkout({ checkoutReview: review }, 1280, '', async page => {
    const trust = page.locator('.pya-checkout [data-part="checkout-trust"] li');
    expect(await trust.count()).toBe(3);
    expect(await trust.allTextContents()).toEqual(['Si no te gusta, te devolvemos tu dinero en 30 días.', 'Pagos seguros · Tus datos viajan cifrados', 'Envío · Entregamos en 24 horas en La Paz.']);
    const suggestion = page.locator('.pya-checkout .pya-co__summary [data-part="cart-suggestions"]');
    expect(await suggestion.locator('h3').textContent()).toBe('Completa tu compra');
    expect(await suggestion.locator('li').count()).toBe(1);
    const card = page.locator('.pya-checkout [data-part="checkout-review"]');
    expect(await card.textContent()).toContain('Lo que dicen nuestros clientes');
    expect(await card.textContent()).toContain('ya pedí otra');
    expect(await card.textContent()).toContain('Lucía M.');
    expect(await card.textContent()).toContain('Compra verificada');
    const smallest = await page.evaluate(() => Math.min(...Array.from(document.querySelectorAll('.pya-checkout [data-part="checkout-trust"] li, .pya-checkout [data-part="checkout-review"] *')).filter(el => el.textContent?.trim()).map(el => parseFloat(getComputedStyle(el).fontSize))));
    expect(smallest).toBeGreaterThanOrEqual(12);
  });
  await checkout({}, 1280, '', async page => {
    expect(await page.locator('.pya-checkout [data-part="checkout-review"]').count()).toBe(0);
    expect(await page.locator('.pya-checkout [data-part="checkout-trust"] li').nth(2).textContent()).toBe('Envío · Entregamos en 24 horas en La Paz.');
  });
});

it('at 390: «Ver resumen · total» opens the summary; the pay button stays visible', async () => {
  await checkout({}, 390, '', async page => {
    const toggle = page.locator('.pya-checkout [data-shell-summary]');
    expect(await toggle.textContent()).toMatch(/Ver resumen.*90/);
    expect(await page.locator('.pya-checkout .pya-co__summary').isVisible()).toBe(false);
    await toggle.click();
    expect(await page.locator('.pya-checkout .pya-co__summary').isVisible()).toBe(true);
    expect(await page.locator('.pya-checkout .pya-co__pay').isVisible()).toBe(true);
  });
});

// Final review 2026-11-09: the summary's − / + were white on white, and its grey small text read 3.4:1.
it('the summary\'s quantity buttons and small text read on the dark column', async () => {
  await checkout({}, 1280, '', async page => {
    const facts = await page.evaluate(() => {
      const summary = getComputedStyle(document.querySelector('.pya-checkout .pya-co__summary') as Element).backgroundColor;
      const button = document.querySelector('.pya-checkout .pya-co__summary .pya-co__stepper button') as Element;
      const small = document.querySelector('.pya-checkout .pya-co__summary small') as Element | null;
      const style = getComputedStyle(button);
      return { summary, glyph: style.color, face: style.backgroundColor, small: small ? getComputedStyle(small).color : null, kit: document.querySelector('.pya-checkout')!.classList.contains('pya-co--kit') };
    });
    const face = facts.face === 'rgba(0, 0, 0, 0)' ? facts.summary : facts.face;
    expect(contrast(face, facts.glyph)).toBeGreaterThanOrEqual(4.5);
    if (facts.small) expect(contrast(facts.summary, facts.small)).toBeGreaterThanOrEqual(4.5);
    expect(facts.kit).toBe(true);
  });
});
