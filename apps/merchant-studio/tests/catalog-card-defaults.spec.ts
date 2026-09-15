import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const kit = (name: string) => readFileSync(new URL(`../../api/src/stores/source-kit/${name}`, import.meta.url), 'utf8');
// Portrait photos like a phone camera shot; demo catalog only.
const portrait = (base64: string) => `data:image/png;base64,${base64}`;
const items = [
  { id: 'bikini', name: 'Bikini Atado', amount: 30000, currency: 'BOB', stock: 4, imageUrls: [portrait('iVBORw0KGgoAAAANSUhEUgAAAFoAAACgCAIAAAADw+wqAAABO0lEQVR4nO3QsRGAIADAQGAhR2JIF6TSM87wX6XOvPY9eKy3sOPPjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjvF1APZcAoEsJTk4AAAAAElFTkSuQmCC')] },
  { id: 'bundle', name: 'The bundle', amount: 20000, currency: 'BOB', stock: 4, imageUrls: [portrait('iVBORw0KGgoAAAANSUhEUgAAAFoAAACgCAIAAAADw+wqAAABO0lEQVR4nO3QsRGAIADAQGAdJ2B7R6PSM87wX6XOvPc1eKy3sOPPjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjrAj7Ag7wo6wI+wIO8KOsCPsCDvCjvF1AMayAmR4WJsaAAAAAElFTkSuQmCC')] },
];

async function storefront(page: Page, css: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('https://cards.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--store-background:#fff5df;--store-foreground:#0b2a80}body{margin:0;font-family:Arial,sans-serif}${css}</style></head><body><section class="collection"><h2>Colección</h2><div data-pagosya-catalog></div></section><div data-pagosya-cart hidden></div><p data-pagosya-status></p><script>window.PAGOSYA_CONFIG=${JSON.stringify({ demo: true, slug: 'cards', data: { storeName: 'BAT', items } })}</script><script>${kit('commerce.js')}</script></body></html>` }));
  await page.goto('https://cards.test/');
  await expect(page.locator('[data-pagosya-catalog] .menu-item')).toHaveCount(2);
}

test('unstyled catalogs get a photo grid with framed photos and readable card text', async ({ page }) => {
  // Mirrors a generated store: light text for a dark section, cream cards, no catalog layout or photo size.
  await storefront(page, '.collection{background:#0b2a80;color:#fff5df;padding:40px}.menu-item{border:3px solid #0b2a80;background:#fff5df;padding:16px}');
  const [first, second] = await page.locator('[data-pagosya-catalog] .menu-item').all();
  const a = (await first.boundingBox())!, b = (await second.boundingBox())!;
  expect(b.y).toBeCloseTo(a.y, 0);
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
  const photo = (await first.locator('.menu-item__image').boundingBox())!;
  expect(photo.height).toBeLessThanOrEqual(photo.width * 1.26);
  const [text, card] = await first.evaluate(el => [getComputedStyle(el.querySelector('h3')!).color, getComputedStyle(el).backgroundColor]);
  expect(text).not.toBe(card);
  expect(text).toBe('rgb(11, 42, 128)');
  await page.screenshot({ path: '.test-artifacts/catalog-card-defaults.png', fullPage: true });
});

test('authored row catalogs keep their layout, photo size and colors', async ({ page }) => {
  await storefront(page, '.menu-item{display:grid;grid-template-columns:100px 1fr 90px 120px;gap:12px;align-items:center;color:#222;padding:12px}.menu-item__image{width:100px;height:100px;object-fit:contain}');
  await expect(page.locator('[data-pagosya-catalog]')).not.toHaveAttribute('data-pagosya-grid');
  const [first, second] = await page.locator('[data-pagosya-catalog] .menu-item').all();
  expect((await second.boundingBox())!.y).toBeGreaterThan((await first.boundingBox())!.y);
  expect((await first.locator('.menu-item__image').boundingBox())!.width).toBeCloseTo(100, 0);
  await expect(first.locator('h3')).toHaveCSS('color', 'rgb(34, 34, 34)');
});
