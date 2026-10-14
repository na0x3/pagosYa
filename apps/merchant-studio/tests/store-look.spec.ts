import { expect, test } from '@playwright/test';
import { DARK, openCart, openKitPage, style } from './kit-look-harness';

// One look per store (spec 2026-10-14): the kit follows config.look, measured from the store's own home page.
const BOLD = { version: 1, type: { heading: { family: 'Anton', weight: 800, case: 'upper', tracking: 0.1 }, label: { case: 'upper', tracking: 0.14, weight: 700 } },
  shape: { photo: 20, card: 20, button: 'pill' }, edge: 'offset', photo: { treatment: 'mono', aspect: 'square' }, surface: 'banded' };

test('product title follows the home headline: family, weight, case, tracking', async ({ page }) => {
  await openKitPage(page, { style: 'editorial', look: BOLD });
  expect(await style(page, '[data-part=title]', 'font-family')).toContain('Anton');
  expect(await style(page, '[data-part=title]', 'font-weight')).toBe('800');
  expect(await style(page, '[data-part=title]', 'text-transform')).toBe('uppercase');
  const [spacing, size] = await page.locator('[data-part=title]').evaluate(el => [parseFloat(getComputedStyle(el).letterSpacing), parseFloat(getComputedStyle(el).fontSize)]);
  expect(spacing / size).toBeCloseTo(0.1, 2);
});

test('dense keeps the measured heading font instead of switching to the body font', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: BOLD });
  expect(await style(page, '[data-part=title]', 'font-family')).toContain('Anton');
});

test('corners follow the home, with no 6px cap', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: BOLD });
  expect(await style(page, '.product-detail__buybox', 'border-top-left-radius')).toBe('20px');
  expect(await style(page, '.product-detail__photo', 'border-top-left-radius')).toBe('20px');
  expect(await style(page, '.product-detail__values:not([data-kind=swatch]) [data-product-option]', 'border-top-left-radius')).toBe('999px');
  expect(await style(page, '.product-detail__badge', 'border-top-left-radius')).toBe('999px');
});

test('the main gallery stays true colour; thumbnails and related products take the treatment until hovered', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: BOLD });
  expect(await style(page, '.product-detail__photo', 'filter')).toBe('none');
  expect(await style(page, '.product-detail__thumbnails img', 'filter')).toBe('grayscale(1)');
  expect(await style(page, '.product-detail__related img', 'filter')).toBe('grayscale(1)');
  await page.locator('.product-detail__related li').first().hover();
  await expect.poll(() => style(page, '.product-detail__related img', 'filter')).toBe('none');
});

test('offset edges reach the gallery and the dense buying box', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: BOLD });
  expect(await style(page, '.product-detail__stage', 'box-shadow')).toMatch(/5px 5px 0px/);
  expect(await style(page, '.product-detail__buybox', 'box-shadow')).toMatch(/5px 5px 0px/);
  expect(await style(page, '.product-detail__stage', 'border-top-left-radius')).toBe(await style(page, '.product-detail__photo', 'border-top-left-radius'));
});

test('a selected option keeps its ink ring under an offset edge', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: BOLD });
  const chips = '.product-detail__values:not([data-kind=swatch]) [data-product-option]';
  const pressed = await page.locator(`${chips}[aria-pressed=true]`).first().evaluate(el => getComputedStyle(el).boxShadow);
  const idle = await page.locator(`${chips}:not([aria-pressed=true])`).first().evaluate(el => getComputedStyle(el).boxShadow);
  expect(pressed).toContain('inset');
  expect(pressed).not.toBe(idle);
});

test('YAPI touch CSS wins over the look', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: BOLD, dna: { productCss: '[data-pagosya-product][data-style] [data-part="stage"]{box-shadow:none}' } });
  expect(await style(page, '.product-detail__stage', 'box-shadow')).toBe('none');
});

test('a pill card shape is bounded to 24px', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: { version: 1, shape: { card: 'pill' } } });
  expect(await style(page, '.product-detail__buybox', 'border-top-left-radius')).toBe('24px');
});

test('gallery controls take the store paper and ink', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: BOLD });
  expect(await style(page, '.product-detail__navigation button', 'background-color')).toBe('rgb(245, 239, 230)');
});

test('a banded home puts related products in a dark band that stays readable, also on a dark store', async ({ page }) => {
  for (const tokens of [undefined, DARK]) {
    await openKitPage(page, { style: 'editorial', look: BOLD, tokens });
    const [fg, bg] = await page.locator('.product-detail__related').evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
    const lum = (c: string) => { const [r, g, b] = c.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    expect((a + 0.05) / (b + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  }
});

test('duotone draws with the store ink and paper through an inline SVG filter', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: { version: 1, photo: { treatment: 'duotone' } } });
  await expect(page.locator('#pagosya-look-duotone')).toHaveCount(1);
  expect(await style(page, '.product-detail__thumbnails img', 'filter')).toContain('pagosya-look-duotone');
  expect(await style(page, '.product-detail__photo', 'filter')).toBe('none');
});

test('duotone on a dark store maps luminance 0 to the darker colour', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: { version: 1, photo: { treatment: 'duotone' } }, tokens: DARK });
  const values = (await page.locator('#pagosya-look-duotone feColorMatrix').getAttribute('values'))!.trim().split(/\s+/).map(Number);
  const offsets = [values[4], values[9], values[14]];
  [0x16 / 255, 0x12 / 255, 0x0f / 255].forEach((expected, i) => expect(offsets[i]).toBeCloseTo(expected, 2));
});

const CARD_IMG = '[data-pagosya-catalog] .menu-item:not([data-custom-product]) .menu-item__image';

test('catalog: page title and cards follow the headline; card photos take shape, aspect and treatment', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openKitPage(page, { path: 'productos.html', look: { ...BOLD, photo: { treatment: 'mono', aspect: 'square', tilt: 3 } } });
  expect(await style(page, '.commerce-page-title', 'font-family')).toContain('Anton');
  expect(await style(page, '.commerce-page-title', 'text-transform')).toBe('uppercase');
  expect(await style(page, CARD_IMG, 'border-top-left-radius')).toBe('20px');
  expect(await style(page, CARD_IMG, 'aspect-ratio')).toBe('1 / 1');
  expect(await style(page, CARD_IMG, 'filter')).toBe('grayscale(1)');
  expect(await style(page, CARD_IMG, 'box-shadow')).toMatch(/5px 5px 0px/);
  const rotations = await page.locator(CARD_IMG).evaluateAll(els => els.slice(0, 2).map(el => getComputedStyle(el).rotate));
  expect(rotations.map(r => Math.abs(parseFloat(r)))).toEqual([3, 3]);
  expect(Math.sign(parseFloat(rotations[0]))).toBe(-Math.sign(parseFloat(rotations[1])));
});

test('cards return to true colour on hover and keyboard focus', async ({ page }) => {
  await openKitPage(page, { path: 'productos.html', look: BOLD });
  await page.locator('[data-pagosya-catalog] .menu-item').first().hover();
  await expect.poll(() => style(page, CARD_IMG, 'filter')).toBe('none');
  await page.mouse.move(0, 0);
  await page.locator('[data-pagosya-catalog] .menu-item .menu-item__details').first().focus();
  await expect.poll(() => style(page, CARD_IMG, 'filter')).toBe('none');
});

test('a YAPI-authored card keeps its own design', async ({ page }) => {
  await openKitPage(page, { path: 'productos.html', look: BOLD });
  const custom = await page.evaluate(() => {
    document.querySelector('[data-pagosya-catalog]')!.insertAdjacentHTML('beforeend', '<article class="menu-item" data-custom-product><img class="menu-item__image" src="https://img.test/4.webp" alt=""></article>');
    const img = document.querySelector('.menu-item[data-custom-product] .menu-item__image')!;
    return { filter: getComputedStyle(img).filter, radius: getComputedStyle(img).borderTopLeftRadius };
  });
  expect(custom).toEqual({ filter: 'none', radius: '0px' });
});

test('cart drawer: heading follows the headline, line photos take polaroid frames', async ({ page }) => {
  await openKitPage(page, { path: 'productos.html', cart: true, look: { ...BOLD, photo: { treatment: 'polaroid' } } });
  await openCart(page);
  expect(await style(page, '.cart-drawer__header h2', 'font-family')).toContain('Anton');
  expect(await style(page, '.cart-drawer .order-item__photo', 'padding-bottom')).toBe('20px');
  expect(await style(page, '.cart-drawer .order-item__photo', 'background-color')).toBe('rgb(255, 255, 255)');
});
