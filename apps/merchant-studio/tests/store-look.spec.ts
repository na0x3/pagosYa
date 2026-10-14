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
