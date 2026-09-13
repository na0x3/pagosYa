import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { compileNextPreview, nextProjectScaffold } from '../../api/src/stores/source-next';
import { nextBrief, nextStoreFiles, nextStoreConfig, nextStoreImage } from '../../api/src/stores/fixtures/next-store';

for (const hosted of [false, true]) test(`computed photo paths load in ${hosted ? 'hosted storefront' : 'Studio preview'}`, async ({ page }) => {
  const authored = nextStoreFiles();
  authored.find(file => file.path === 'components/home.tsx')!.content = `import { useState } from 'react';
    const directory = '/assets/';
    export default function Home() {
      const [alternate, setAlternate] = useState(false);
      return <main><button onClick={() => setAlternate(!alternate)}>Change photo</button>
        {Array.from({length: 8}, (_, i) => <img key={i} alt={'Photo ' + i} src={directory + 'photo-' + (alternate ? 7 - i : i) + '.png'} />)}
        <div data-background style={{ backgroundImage: 'url(' + directory + 'photo-0.png)' }}>Photo background</div>
        <div data-pagosya-catalog /><div data-pagosya-cart hidden /><p data-pagosya-status /><button data-cart-open>My order</button>
      </main>;
    }`;
  const files = [...authored, ...await compileNextPreview(authored),
    ...Array.from({ length: 8 }, (_, i) => ({ ...nextStoreImage, path: `assets/photo-${i}.png` }))];
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?demo=1');
  await page.evaluate(async ({ files, brief, hosted }) => {
    const { sourcePreviewDocument } = await import('/src/source-preview.ts' as string);
    document.body.innerHTML = '';
    const frame = document.createElement('iframe'); frame.title = 'Computed photos'; frame.sandbox.add('allow-scripts');
    frame.srcdoc = sourcePreviewDocument({ schemaVersion: 1, brief, files }, 'index.html', { hosted }); document.body.append(frame);
  }, { files, brief: nextBrief, hosted });
  const frame = page.frameLocator('iframe[title="Computed photos"]');
  await expect(frame.locator('img')).toHaveCount(8);
  for (let i = 0; i < 8; i++) {
    await expect(frame.getByRole('img', { name: `Photo ${i}`, exact: true })).toHaveJSProperty('naturalWidth', 1);
  }
  await expect(frame.locator('[data-background]')).toHaveCSS('background-image', /data:image\/png;base64,/);
  await frame.getByRole('button', { name: 'Change photo' }).click();
  await expect(frame.getByRole('img', { name: 'Photo 0', exact: true })).toHaveJSProperty('naturalWidth', 1);
  expect(await frame.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("connect-src 'none'");
  expect(errors).toEqual([]);
});

test('React location maps retain the restricted preview policy', async ({ page }) => {
  const authored = nextStoreFiles();
  authored[1].content = authored[1].content.replace('</main>', '<iframe src="https://www.google.com/maps/embed?pb=test-location" title="Ubicación central" loading="lazy" width="100%" height="360"/></main>');
  const files = [...authored, ...await compileNextPreview(authored), ...nextProjectScaffold('test')];
  await page.route('https://www.google.com/maps/embed?pb=test-location', route => route.fulfill({ contentType: 'text/html', body: '<p>Mapa de prueba</p>' }));
  await page.goto('/?demo=1');
  await page.evaluate(async snapshot => {
    const { sourcePreviewDocument } = await import('/src/source-preview.ts' as string);
    document.body.innerHTML = '';
    const frame = document.createElement('iframe'); frame.title = 'React location'; frame.sandbox.add('allow-scripts'); frame.style.cssText = 'width:100%;height:900px';
    frame.srcdoc = sourcePreviewDocument(snapshot); document.body.append(frame);
  }, { schemaVersion: 1, brief: nextBrief, files });
  const frame = page.frameLocator('iframe[title="React location"]');
  await expect(frame.frameLocator('iframe[title="Ubicación central"]').getByText('Mapa de prueba')).toBeVisible();
  await expect(page.locator('iframe[title="React location"]')).toHaveAttribute('sandbox', 'allow-scripts');
  const policy = await frame.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain('frame-src https://www.google.com/maps/embed');
  expect(policy).toContain("connect-src 'none'");
});

for (const width of [1280, 390]) test(`React storefront supports state, assets and complete shopping at ${width}px`, async ({ page }) => {
  const authored = nextStoreFiles();
  const files = [...authored, ...await compileNextPreview(authored), ...nextProjectScaffold('test'), nextStoreImage,
    { path: 'brand.css', content: '/* fixture */' },
    { path: 'config.js', content: `window.PAGOSYA_CONFIG=${JSON.stringify(nextStoreConfig)};` },
    ...['commerce.js', 'commerce-pages.css'].map(path => ({ path, content: readFileSync(new URL(`../../api/src/stores/source-kit/${path}`, import.meta.url), 'utf8') })),
  ];
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width, height: 900 }); await page.goto('/?demo=1');
  await page.evaluate(async snapshot => {
    const { sourcePreviewDocument } = await import('/src/source-preview.ts' as string);
    document.body.innerHTML = ''; document.body.style.margin = '0';
    const frame = document.createElement('iframe'); frame.sandbox.add('allow-scripts'); frame.title = 'React preview'; frame.style.cssText = 'width:100%;height:100vh;border:0'; document.body.append(frame);
    const navigate = (name: string, navigation = {}) => { frame.srcdoc = sourcePreviewDocument(snapshot, name, navigation); };
    window.addEventListener('message', event => { if (event.source === frame.contentWindow && event.data?.type === 'pagosya:source-navigate') navigate(event.data.page, event.data); });
    navigate('index.html');
  }, { schemaVersion: 1, brief: nextBrief, files });
  const frame = page.frameLocator('iframe[title="React preview"]');
  await expect(frame.getByRole('heading', { name: 'Nuestra carta' })).toHaveCSS('font-size', '30px');
  await expect(frame.getByRole('img', { name: 'Marca de prueba' })).toHaveJSProperty('naturalWidth', 1);
  await frame.getByRole('button', { name: 'Horarios' }).click();
  await expect(frame.getByText('Abierto de 8 a 18')).toBeVisible();
  await frame.getByRole('button', { name: 'Añadir Café filtrado', exact: true }).click();
  await frame.getByRole('button', { name: 'Horarios' }).click(); // React updates must preserve runtime DOM/cart.
  await expect(frame.locator('[data-cart-count]')).toHaveText('1');
  await frame.locator('.menu-item__details').click();
  await expect(frame.locator('[data-pagosya-product-page]')).toContainText('Café filtrado');
  await expect(frame.locator('[data-cart-count]')).toHaveText('1');
  await frame.getByRole('button', { name: /Mi pedido/ }).click();
  await frame.getByRole('button', { name: 'Continuar con mi pedido' }).click();
  await expect(frame.getByRole('heading', { name: '¿Cómo quieres recibir tu pedido?' })).toBeVisible();
  await frame.getByRole('button', { name: 'Continuar al pago de prueba' }).click();
  await expect(frame.getByRole('heading', { name: 'Pago de prueba' })).toBeVisible();
  expect(errors).toEqual([]);
  expect(await frame.locator('html').evaluate(el => el.scrollWidth <= innerWidth)).toBe(true);
});
