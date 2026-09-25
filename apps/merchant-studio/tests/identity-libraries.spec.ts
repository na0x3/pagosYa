import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

/** Identity libraries T2a/T2b in the real preview sandbox (its CSP included): the paws pack in every placement, each new
 * button form and frame, at 1280 and 390. Screenshots in tmp/identity-shots are looked at before merging. */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const SHOTS = '../../tmp/identity-shots';
mkdirSync(SHOTS, { recursive: true });
const pack = (id: string) => {
  const manifest = JSON.parse(readFileSync(kitPath('motif-packs', id, 'pack.json'), 'utf8'));
  return { id, motifs: manifest.motifs.map((motif: any) => ({ placement: motif.placement, behavior: motif.behavior, svg: readFileSync(kitPath('motif-packs', id, motif.file), 'utf8') })) };
};
const PHOTO = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="#e9d8c4"/><circle cx="200" cy="230" r="120" fill="#b4441f"/><rect x="120" y="380" width="160" height="40" rx="20" fill="#7a2e14"/></svg>').toString('base64');
const ITEMS = [
  { id: 'galleta', name: 'Galletas de pollo', amount: 3590, currency: 'BOB', stock: 9, imageUrls: [PHOTO], description: 'Horneadas sin conservantes' },
  { id: 'hueso', name: 'Hueso de cuero', amount: 2500, currency: 'BOB', stock: 9, imageUrls: [PHOTO], description: 'Para morder sin culpa' },
  { id: 'collar', name: 'Collar tejido', amount: 6000, currency: 'BOB', stock: 3, imageUrls: [PHOTO], description: 'Hecho a mano' },
];
const CSS = `:root{--store-background:#fbf6ee;--store-foreground:#2a1d12;--store-accent:#b4441f;--store-accent-foreground:#ffffff}
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#fbf6ee;color:#2a1d12}header{display:flex;justify-content:space-between;align-items:center;padding:16px clamp(16px,4vw,48px)}
.hero{padding:clamp(40px,8vw,96px) clamp(16px,4vw,48px);background:#fbf6ee;color:#2a1d12}.hero h1{font-size:clamp(36px,7vw,72px);margin:0 0 12px}
.cta{display:inline-flex;align-items:center;gap:.5em;padding:.8em 1.4em;border-radius:999px;background:#b4441f;color:#fff;text-decoration:none;font-weight:700}
.badge{padding:.3em .8em;border-radius:999px;background:#2a1d12;color:#fbf6ee;font-size:14px;margin-left:12px}
#catalogo{padding:0 clamp(16px,4vw,48px) 48px}[data-motif-divider]{margin-inline:clamp(16px,4vw,48px)}`;
const html = `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><script src="config.js" defer></script><script src="commerce.js" defer></script></head><body>
<header><strong>Huellitas</strong><button type="button" data-cart-open>Pedido <b data-cart-count>0</b></button></header>
<main><section class="hero" data-motif-pattern><h1>Huellitas</h1><p>Snacks horneados para perros felices.</p><a class="cta" href="#catalogo">Ver snacks <span data-motif-icon></span></a><span class="badge" data-motif-sticker>¡Nuevo!</span></section>
<div data-motif-divider></div><section id="catalogo"><h2>Snacks</h2><div data-pagosya-catalog></div></section></main>
<div data-pagosya-cart hidden></div><p data-pagosya-status></p></body></html>`;
const config = (dna: Record<string, string>) => 'window.PAGOSYA_CONFIG=' + JSON.stringify({ slug: 'huellitas', data: { storeName: 'Huellitas', locations: [], categories: [], items: ITEMS },
  dna: { version: 1, hover: 'lift', press: 'squash', radius: 'round', border: 'hairline', cart: 'drawer', added: 'toast', review: 'split', card: 'still', motion: 'playful', ...dna }, motifPack: pack('paws') }) + ';';

async function mount(browserPage: any, dna: Record<string, string>, cart: Array<{ id: string; quantity: number }> = []) {
  await browserPage.goto('/?demo=1');
  await browserPage.evaluate(async ({ commerce, html, config, cart }: any) => {
    const { sourcePreviewDocument } = await import('/src/storefront-preview.ts');
    const snapshot = { schemaVersion: 1, brief: {}, files: [{ path: 'index.html', content: html }, { path: 'config.js', content: config }, { path: 'commerce.js', content: commerce }] };
    document.body.innerHTML = ''; document.body.style.margin = '0';
    const frame = document.createElement('iframe'); frame.title = 'Tienda'; frame.sandbox.add('allow-scripts'); frame.style.cssText = 'width:100%;height:100vh;border:0';
    frame.srcdoc = sourcePreviewDocument(snapshot, 'index.html', { cart }); document.body.append(frame);
  }, { commerce, html, config: config(dna), cart });
  return browserPage.frameLocator('iframe');
}

const COMBOS = [['sticker', 'blob'], ['ticket', 'stamp'], ['bubbly', 'tape'], ['brutal', 'stamp']] as const;
for (const width of [1280, 390]) for (const [button, frame] of COMBOS) test(`${button} buttons and ${frame} frames with the paws pack at ${width}px`, async ({ page: browserPage }) => {
  await browserPage.setViewportSize({ width, height: 900 });
  await browserPage.emulateMedia({ reducedMotion: 'reduce' });
  const shop = await mount(browserPage, { button, frame }, [{ id: 'galleta', quantity: 2 }]);
  await expect(shop.locator('.menu-item').first()).toBeVisible();
  await expect(shop.locator('html')).toHaveAttribute('data-dna-button', button);
  await expect(shop.locator('.hero')).toHaveAttribute('data-motif-pattern', 'placed');
  await expect(shop.locator('.cta [data-motif-icon="placed"] svg')).toHaveCount(1);
  await expect(shop.locator('[data-motif-divider="placed"] .pagosya-motif')).toHaveCount(1);
  await expect(shop.locator('.badge .pagosya-motif')).toHaveCount(1);
  expect(await shop.locator('.pagosya-motif:not([aria-hidden="true"])').count()).toBe(0);
  expect(await shop.locator('html').evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await browserPage.screenshot({ path: `${SHOTS}/home-${button}-${frame}-${width}.png` });
  await shop.getByRole('button', { name: /Pedido/ }).first().click();
  await expect(shop.locator('dialog.cart-drawer[open] .checkout-button')).toBeVisible();
  await browserPage.screenshot({ path: `${SHOTS}/cart-${button}-${frame}-${width}.png` });
  await browserPage.keyboard.press('Escape');
  await expect(shop.locator('dialog.cart-drawer[open]')).toHaveCount(0);
  await shop.locator('.menu-item .menu-item__details').first().click();
  await expect(shop.locator('.product-detail__buy [data-motif-icon="placed"] svg')).toBeVisible();
  await browserPage.screenshot({ path: `${SHOTS}/product-${button}-${frame}-${width}.png` });
});

for (const width of [1280, 390]) test(`the empty cart draws the pack at ${width}px`, async ({ page: browserPage }) => {
  await browserPage.setViewportSize({ width, height: 900 });
  await browserPage.emulateMedia({ reducedMotion: 'reduce' });
  const shop = await mount(browserPage, { button: 'bubbly', frame: 'tape' });
  await shop.getByRole('button', { name: /Pedido/ }).first().click();
  await expect(shop.locator('dialog.cart-drawer[open] li.order-empty .pagosya-motif[data-motif-slot="empty"] svg')).toBeVisible();
  await browserPage.screenshot({ path: `${SHOTS}/empty-cart-${width}.png` });
});

test('motifs animate on hover, and nothing moves with reduced motion', async ({ page: browserPage }) => {
  for (const reduced of [false, true]) {
    await browserPage.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const shop = await mount(browserPage, { button: 'sticker', frame: 'blob' });
    await shop.locator('.cta').hover();
    await browserPage.waitForTimeout(80);
    const running = await shop.locator('.cta').evaluate((cta: Element) => Array.from(cta.querySelectorAll('.pagosya-motif, .pagosya-motif *')).reduce((sum, el) => sum + el.getAnimations().length, 0));
    if (reduced) expect(running).toBe(0); else expect(running).toBeGreaterThan(0);
  }
});

test('a store with the pack and a new form still passes the shopping checks', async ({ page: browserPage }) => {
  await browserPage.goto('/?demo=1');
  const results = await browserPage.evaluate(async ({ commerce, html, config }: any) => {
    const { checkSourceWebsite } = await import('/src/source-checks.ts');
    return checkSourceWebsite({ schemaVersion: 1, brief: { sitePurpose: 'shop' }, files: [{ path: 'index.html', content: html }, { path: 'config.js', content: config }, { path: 'commerce.js', content: commerce }] } as any);
  }, { commerce, html, config: config({ button: 'ticket', frame: 'stamp' }) });
  const critical = ['Añadir un producto', 'Compra de producto', 'Controles de compra completos', 'Pedido abre el carrito', 'Ancho de la página', 'JavaScript'];
  expect(results.filter((result: any) => critical.includes(result.label) && result.status === 'failed')).toEqual([]);
});
