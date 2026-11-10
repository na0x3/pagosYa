import { kitDefaultSnapshot, parseConfig } from './source-scorecard-capture';
import { withVisualSandbox } from './source-visual-capture';

/** Spec 2026-11-09 personalizador (owner approved the examples page): the product's own choices on a big stage, added through the
 *  kit's own add path; the frame only in art stores; «Pedir por WhatsApp» on a WhatsApp store; nothing when there are no options. */
jest.setTimeout(90_000);
const variant = (id: string, colour: string, size: string, stock: number | null, photo?: string) =>
  ({ id, name: `${colour} / ${size}`, amount: 12000, stock, options: [{ name: 'Color', value: colour }, { name: 'Talla', value: size }], ...(photo ? { imageUrls: [photo] } : {}) });
const tee = { id: 'tee', name: 'Polera Remolino', amount: 12000, currency: 'BOB', stock: null, imageUrls: ['/v1/uploads/tee.jpg'], extras: [],
  variants: [variant('negro-s', 'Negro', 'S', 9, '/v1/uploads/negro.jpg'), variant('negro-m', 'Negro', 'M', 9, '/v1/uploads/negro.jpg'),
    variant('rosa-s', 'Rosa', 'S', 0, '/v1/uploads/rosa.jpg'), variant('rosa-m', 'Rosa', 'M', 3, '/v1/uploads/rosa.jpg')] };
const print = { id: 'print', name: 'Ramo de Flores', amount: 28090, currency: 'BOB', stock: null, imageUrls: ['/v1/uploads/ramo.jpg'], extras: [],
  variants: [['Negro', '30 × 40 cm'], ['Dorado', '30 × 40 cm'], ['Negro', '50 × 70 cm'], ['Dorado', '50 × 70 cm']].map(([frame, size], at) =>
    ({ id: `p${at}`, name: `${frame} / ${size}`, amount: 28090, stock: null, options: [{ name: 'Marco', value: frame }, { name: 'Tamaño', value: size }] })) };
const mug = { id: 'mug', name: 'Taza', amount: 9000, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [] };
const host = (id: string, look = 'stage') => `<section data-lb="product-personalizer"><h2>Elige</h2><div data-pagosya-personalizer data-product-id="${id}" data-look="${look}"></div></section>`;

async function page(data: Record<string, unknown>, markup: string, run: (page: import('playwright').Page) => Promise<void>) {
  const snapshot = await kitDefaultSnapshot();
  const index = snapshot.files.find(file => file.path === 'index.html')!;
  index.content = index.content.replace('</body>', `${markup}</body>`);
  const config = parseConfig(snapshot);
  Object.assign(config.data, { checkoutMode: 'payment', items: [tee, print, mug], ...data });
  snapshot.files.find(file => file.path === 'config.js')!.content = `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};`;
  await withVisualSandbox(snapshot, '', undefined, true, async context => {
    const tab = await context.newPage();
    await tab.setViewportSize({ width: 1280, height: 900 });
    await tab.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
    await tab.locator('[data-pagosya-personalizer] .pz').waitFor({ timeout: 5000 }).catch(() => undefined);
    await run(tab);
    await tab.close();
  });
}
const pz = '[data-pagosya-personalizer]';

it('draws the product\'s colours as circles and its sizes as pills, with its price and «Añadir al carrito»', async () => {
  await page({}, host('tee'), async tab => {
    const facts = await tab.evaluate(sel => {
      const root = document.querySelector(sel)!;
      return { name: root.querySelector('.pz__title')?.textContent, swatches: Array.from(root.querySelectorAll('.pz__swatch')).map(b => b.getAttribute('aria-label')),
        chips: Array.from(root.querySelectorAll('.pz__chip')).map(b => b.textContent), price: root.querySelector('.pz__price')?.textContent?.replace(/\s/g, ' '),
        button: root.querySelector('.pz__btn')?.textContent?.trim(), black: getComputedStyle(root.querySelector('.pz__swatch')!).backgroundColor, frame: Boolean(root.querySelector('.pz__frame')) };
    }, pz);
    expect(facts).toMatchObject({ name: 'Polera Remolino', swatches: ['Negro', 'Rosa'], chips: ['S', 'M'], button: 'Añadir al carrito', frame: false });
    expect(facts.price).toMatch(/120,00/);
    expect(facts.black).toBe('rgb(41, 43, 41)');
    // Live 2026-11-09: the button's offset shadow took the button's own (light) text colour and vanished; it is the store's ink.
    const shade = await tab.locator(`${pz} .pz__btn`).evaluate(el => ({ shadow: getComputedStyle(el).boxShadow, ink: getComputedStyle(el).color, text: getComputedStyle(el.closest('.pz')!).color }));
    expect(shade.shadow).toContain(shade.text);
    expect(shade.shadow).not.toContain(shade.ink);
  });
});

it('a colour swaps the photo; a sold-out choice is disabled; few left says so; the add puts that choice and quantity in the cart', async () => {
  await page({}, host('tee'), async tab => {
    await tab.locator(`${pz} .pz__swatch[aria-label="Rosa"]`).click();
    // The photo fades out and back in with the new one.
    await tab.waitForFunction(sel => document.querySelector(sel)?.getAttribute("src")?.includes("rosa.jpg"), `${pz} .pz__photo`, { timeout: 2000 });
    expect(await tab.locator(`${pz} .pz__chip`, { hasText: 'S' }).isDisabled()).toBe(true);
    await tab.locator(`${pz} .pz__chip`, { hasText: 'M' }).click();
    expect(await tab.locator(`${pz} .pz__stock`).textContent()).toBe('¡Quedan 3!');
    await tab.locator(`${pz} [data-pz-plus]`).click();
    expect(await tab.locator(`${pz} .pz__btn`).getAttribute('data-add')).toBe(JSON.stringify(['tee', 'rosa-m']));
    expect(await tab.locator(`${pz} .pz__btn`).getAttribute('data-quantity')).toBe('2');
    await tab.locator(`${pz} .pz__btn`).click();
    await tab.locator('body > header [data-cart-open]').click();
    await tab.locator('.cart-drawer[open]').waitFor();
    expect(await tab.locator('.cart-drawer .order-item').count()).toBe(1);
    expect(await tab.locator('.cart-drawer .order-item').textContent()).toContain('Rosa');
    expect(await tab.locator('.cart-drawer .order-item .quantity').textContent()).toContain('2');
  });
});

it('an art store\'s print hangs in a frame: «Marco» colours the frame, a bigger «Tamaño» widens it', async () => {
  await page({}, host('print', 'frame'), async tab => {
    expect(await tab.locator(`${pz} .pz__frame`).count()).toBe(1);
    await tab.locator(`${pz} .pz__swatch[aria-label="Dorado"]`).click();
    const gold = await tab.locator(`${pz} .pz__swatch[aria-label="Dorado"]`).evaluate(el => getComputedStyle(el).backgroundColor);
    expect(await tab.locator(`${pz} .pz__frame`).evaluate(el => getComputedStyle(el).borderTopColor)).toBe(gold);
    const before = await tab.locator(`${pz} .pz__frame`).evaluate(el => el.getBoundingClientRect().width);
    await tab.locator(`${pz} .pz__chip`, { hasText: '50 × 70 cm' }).click();
    await tab.waitForTimeout(450);
    expect(await tab.locator(`${pz} .pz__frame`).evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(before);
  });
});

it('a WhatsApp store orders by WhatsApp, with the choice written in the message', async () => {
  await page({ checkoutMode: 'whatsapp', contactPhone: '71234567' }, host('tee'), async tab => {
    await tab.locator(`${pz} .pz__swatch[aria-label="Rosa"]`).click();
    await tab.locator(`${pz} .pz__chip`, { hasText: 'M' }).click();
    const button = tab.locator(`${pz} .pz__btn`);
    expect((await button.textContent())?.trim()).toBe('Pedir por WhatsApp');
    const url = decodeURIComponent(await button.getAttribute('data-wa-url') ?? '');
    expect(url).toContain('https://wa.me/71234567?text=');
    expect(url).toContain('«Polera Remolino» · Color: Rosa · Talla: M');
  });
});

it('a product without options, or one not in the catalogue, hides the section', async () => {
  await page({}, host('mug') + host('gone'), async tab => {
    expect(await tab.locator('section[data-lb="product-personalizer"]').evaluateAll(sections => sections.map(s => (s as HTMLElement).hidden))).toEqual([true, true]);
  });
});
