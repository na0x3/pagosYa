import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const image = readFileSync(resolve(import.meta.dirname, '../../../examples/independent-cafe/assets/breakfast.webp')).toString('base64');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const text = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

// A small contract fixture exercises the real Studio, preview edit hooks and commerce runtime.
// Registered production geometries have separate API renderer/visual coverage.
async function draftStore(page: import('@playwright/test').Page) {
  let revision = 1;
  let sketch: any = {
    palette: { paper: '#f3efe5', ink: '#32352a', accent: '#545e36', deep: '#343b29', pop: '#dccfba' },
    fonts: { display: 'instrument-serif', text: 'epilogue' }, scale: 'm',
    blocks: [
      { id: 'intro', type: 'hero', variant: 'photo-right', composition: 'editorial-split', headline: 'AFTER HOURS', sub: 'Café y discos a tu ritmo.', cta: 'Ver café', photo: 'assets/a.webp', bg: 'paper', size: 'l' },
      { id: 'cat', type: 'catalog', composition: 'grid', title: 'La selección', bg: 'paper', size: 'm' },
      { id: 'fin', type: 'footer', tagline: 'Nos vemos después.', wordmark: 'plain', bg: 'deep', size: 'm' },
    ],
  };
  const saves: any[] = [];
  const catalog = { storeName: 'AFTER HOURS', items: [{ id: 'p1', name: 'House blend', amount: 12000, currency: 'BOB', stock: 6, description: 'Café para tu próxima pausa.' }], categories: [] };
  const version = () => ({ revision, label: 'Boceto', snapshot: { schemaVersion: 1, brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Editorial', sitePurpose: 'shop' }, files: [
    { path: 'index.html', content: `<meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f3efe5;color:#32352a;font:18px sans-serif}section{padding:48px 5%}h1{font:clamp(40px,6vw,84px)/1.05 Georgia;margin:0;overflow-wrap:anywhere}.hero{display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:center}.hero img{width:100%;height:340px;object-fit:cover}.menu-item{max-width:360px;margin-block:20px}button,a{min-height:44px}footer{padding:32px}@media(max-width:700px){.hero{grid-template-columns:1fr}.hero img{height:220px}}[data-skb-composition=poster]{grid-template-columns:1fr}</style><header><button data-cart-open>Mi pedido <span data-cart-count>0</span></button></header><main>${sketch.blocks.map((block: any) => block.type === 'hero' ? `<section class="hero" data-skb="${block.id}" id="skb-${block.id}" data-skb-composition="${block.composition}"><div data-skb-group="copy"><h1 data-skb-node="title" data-skb-field="headline">${text(block.headline)}</h1><p data-skb-node="sub" data-skb-field="sub">${text(block.sub)}</p><a href="#skb-cat" data-skb-field="cta">${text(block.cta)}</a></div><img data-skb-node="photo" data-skb-photo="photo" src="${block.photo}" alt="Café y desayuno"></section>` : block.type === 'catalog' ? `<section data-skb="${block.id}" id="skb-${block.id}"><h2 data-skb-field="title">${text(block.title)}</h2><div data-pagosya-catalog></div></section>` : `<footer data-skb="${block.id}" id="skb-${block.id}"><p data-skb-field="tagline">${text(block.tagline || '')}</p></footer>`).join('')}</main><section data-pagosya-cart hidden></section><p data-pagosya-status></p><script src="config.js"></script><script src="commerce.js"></script>` },
    { path: 'config.js', content: `window.PAGOSYA_CONFIG=${JSON.stringify({ slug: 'after-hours', data: catalog })};` },
    { path: 'commerce.js', content: commerce },
    { path: 'sketch.json', content: JSON.stringify(sketch) },
    ...['a', 'b'].map(name => ({ path: `assets/${name}.webp`, content: image, encoding: 'base64' })),
  ] } });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: any = {};
    if (path.endsWith('/dashboard/login')) body = { token: 'test-session' };
    else if (path.endsWith('/stores')) body = [{ id: 's1', name: 'AFTER HOURS', slug: 'after-hours' }];
    else if (path.endsWith('/conversation')) body = { messages: [{ id: 'a1', role: 'ASSISTANT', content: 'Tu boceto está listo. Podemos ajustarlo aquí o editarlo en el lienzo.', createdAt: '2026-10-05' }] };
    else if (path.endsWith('/catalog')) body = catalog;
    else if (path.endsWith('/draft-preview')) body = { at: null };
    else if (path.endsWith('/chat-jobs')) body = { job: null };
    else if (path.endsWith('/estimate')) body = { model: 'auto', maxCredits: 25, estimate: { minCredits: 1, maxCredits: 2 } };
    else if (path.endsWith('/sketch')) {
      if (route.request().method() === 'PUT') { const saved = route.request().postDataJSON(); expect(saved.revision).toBe(revision); sketch = saved.sketch; revision++; saves.push(structuredClone(saved)); }
      body = { revision, sketch, photos: ['assets/a.webp', 'assets/b.webp'], fonts: ['instrument-serif', 'epilogue'] };
    } else if (/\/versions\/\d+$/.test(path)) body = version();
    else if (path.endsWith('/source-project')) body = { revision, versions: [version()], nextBefore: null };
    await route.fulfill({ json: body });
  });
  await page.goto('/?source=1');
  await page.getByLabel('Correo', { exact: true }).fill('test@example.com');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al Studio', exact: true }).click();
  await expect(page.locator('#source-boceto-tab')).toBeEnabled();
  return { saves, current: () => sketch };
}

test('YAPI preview → optional canvas: edit text, images and sections → saved preview and commerce', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const draft = await draftStore(page);
  await expect(page.locator('.studio-workspace')).not.toHaveClass(/is-boceto/);
  await expect(page.getByRole('textbox', { name: 'Indicación para YAPI' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('yapi-preview-desktop.png') });
  await page.locator('#source-boceto-tab').click();
  await expect(page.locator('[data-boceto-block="intro"]')).toBeVisible();
  const frame = page.frameLocator('iframe[title="Vista previa del sitio"]');
  const headline = frame.locator('[data-skb-field="headline"]');
  await headline.dblclick();
  await expect(headline).toHaveAttribute('contenteditable', /true|plaintext-only/);
  await headline.fill('Una pausa con carácter'); await headline.press('Enter');
  await expect.poll(() => draft.current().blocks[0].headline).toBe('Una pausa con carácter');
  await frame.locator('img[data-skb-photo]').hover();
  await frame.getByRole('button', { name: 'Cambiar foto' }).click();
  await page.locator('.bct-thumbs--big .bct-thumb').nth(1).click();
  await expect.poll(() => draft.current().blocks[0].photo).toBe('assets/b.webp');
  await page.locator('[data-boceto-block="intro"] .bct-block__head').click();
  await page.locator('select').filter({ has: page.locator('option[value="poster"]') }).selectOption('poster');
  await expect.poll(() => draft.current().blocks[0].composition).toBe('poster');
  await page.locator('[data-boceto-block="intro"] [data-boceto-duplicate]').click();
  await expect.poll(() => draft.current().blocks.length).toBe(4);
  await page.locator('[data-boceto-block="intro-copia"]').hover();
  await page.locator('[data-boceto-block="intro-copia"] [data-boceto-move-down]').click();
  await expect.poll(() => draft.current().blocks[2].id).toBe('intro-copia');
  await page.locator('[data-boceto-block="intro-copia"]').hover();
  await page.locator('[data-boceto-block="intro-copia"] [data-boceto-delete]').click();
  await expect.poll(() => draft.current().blocks.length).toBe(3);
  await page.locator('#source-boceto-close').click();
  await expect(page.locator('.studio-workspace')).not.toHaveClass(/is-boceto/);
  await expect(frame.locator('h1')).toHaveText('Una pausa con carácter');
  await expect(frame.locator('[data-pagosya-catalog] [data-add]').first()).toBeVisible();
  await frame.locator('[data-pagosya-catalog] [data-add]').first().click();
  await expect(frame.locator('[data-cart-count]').first()).toHaveText('1');
  await page.locator('#source-width').click();
  await expect(frame.locator('h1')).toHaveText('Una pausa con carácter');
  expect(await frame.locator('html').evaluate(el => el.scrollWidth <= innerWidth + 2)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('yapi-preview-mobile.png') });
  await page.locator('#source-boceto-tab').click();
  await expect(page.locator('[data-boceto-block="intro"]')).toBeVisible();
  expect(await page.locator('[data-boceto-tab="yapi"]').count()).toBe(0);
  const chatBox = await page.locator('.agent-panel').boundingBox();
  const canvasBox = await page.locator('.source-canvas').boundingBox();
  expect(chatBox!.x + chatBox!.width).toBeLessThanOrEqual(canvasBox!.x + 2);
  await expect(page.getByRole('textbox', { name: 'Indicación para YAPI' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('boceto-yapi-desktop.png') });
  await page.locator('#source-boceto-close').click();
  await page.locator('#source-boceto-tab').click();
  await expect(page.getByRole('textbox', { name: 'Indicación para YAPI' })).toBeVisible();
  expect(errors).toEqual([]);
  expect(draft.saves.length).toBeGreaterThanOrEqual(6);
});
