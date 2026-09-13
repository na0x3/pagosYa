import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { compileNextPreview, nextProjectScaffold } from '../../api/src/stores/source-next';
import { withCreativeAssets } from '../../api/src/stores/source-creative-assets';
import { creativeStoreFiles } from '../../api/src/stores/fixtures/creative-store';
import { nextBrief, nextStoreConfig } from '../../api/src/stores/fixtures/next-store';

let files: Awaited<ReturnType<typeof compileNextPreview>>;
test.beforeAll(async () => {
  const authored = creativeStoreFiles();
  files = withCreativeAssets([...authored, ...await compileNextPreview(authored), ...nextProjectScaffold('creative'),
    { path: 'brand.css', content: '/* fixture */' },
    ...['commerce.js', 'commerce-pages.css', 'motion.js'].map(path => ({ path: path === 'motion.js' ? 'site.js' : path, content: readFileSync(new URL(`../../api/src/stores/source-kit/${path}`, import.meta.url), 'utf8') })),
  ]).filter((file, index, all) => all.findLastIndex(candidate => candidate.path === file.path) === index);
});

for (const mode of ['auto', 'off', 'reduced', 'hosted']) test(`creative tools render and stay usable in ${mode}`, async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: mode === 'hosted' ? 390 : 1280, height: 900 });
  await page.goto('/?demo=1');
  await page.evaluate(async ({ snapshot, hosted }) => {
    const { sourcePreviewDocument } = await import('/src/source-preview.ts' as string);
    document.body.innerHTML = ''; document.body.style.margin = '0';
    const frame = document.createElement('iframe'); frame.title = 'Creative preview'; frame.sandbox.add('allow-scripts');
    frame.style.cssText = 'width:100%;height:100vh;border:0';
    frame.srcdoc = sourcePreviewDocument(snapshot, 'index.html', { hosted }); document.body.append(frame);
  }, { snapshot: { schemaVersion: 1, brief: nextBrief, files: [...files, { path: 'config.js', content: `window.PAGOSYA_CONFIG=${JSON.stringify({ ...nextStoreConfig, motion: mode === 'off' ? 'off' : 'auto' })};` }] }, hosted: mode === 'hosted' });
  const frame = page.frameLocator('iframe[title="Creative preview"]');
  await expect(frame.getByRole('heading', { name: 'Una carta con carácter' })).toBeVisible();
  for (const name of ['Café ilustrado', 'Croissant ilustrado']) await expect.poll(() => frame.getByRole('img', { name }).evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await expect(frame.locator('[data-creative-lottie] svg')).toHaveCount(1);
  const playing = mode === 'auto' || mode === 'hosted';
  await expect(frame.locator('[data-creative-lottie]')).toHaveAttribute('data-animation-state', playing ? 'playing' : 'paused');
  await frame.getByRole('button', { name: 'Mover estrella' }).click();
  await expect(frame.getByText('Abierto de 8 a 18')).toBeVisible();
  await expect(frame.locator('[data-motion-probe]')).toHaveCSS('transform', playing ? 'matrix(1, 0, 0, 1, 80, 0)' : 'matrix(1, 0, 0, 1, 0, 0)');
  if (playing) {
    const dot = frame.locator('[data-creative-lottie] svg > g > g').first();
    const before = await dot.getAttribute('transform');
    await expect.poll(() => dot.getAttribute('transform')).not.toBe(before);
    await frame.getByRole('button', { name: 'Pausar animación' }).click();
    await expect(frame.locator('[data-creative-lottie]')).toHaveAttribute('data-animation-state', 'paused');
    const paused = await dot.getAttribute('transform');
    await frame.getByRole('button', { name: 'Probar gesto' }).click();
    expect(await dot.getAttribute('transform')).toBe(paused);
    await frame.getByRole('button', { name: 'Reanudar animación' }).click();
    await expect.poll(() => dot.getAttribute('transform')).not.toBe(paused);
  }
  await frame.getByRole('button', { name: 'Añadir Café filtrado', exact: true }).click();
  await expect(frame.locator('[data-cart-count]')).toHaveText('1');
  await frame.getByRole('button', { name: 'Mostrar animación' }).click();
  await expect(frame.locator('[data-creative-lottie] svg')).toHaveCount(0);
  await frame.getByRole('button', { name: 'Mostrar animación' }).click();
  await expect(frame.locator('[data-creative-lottie] svg')).toHaveCount(1);
  expect(await frame.locator('html').evaluate(el => el.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
