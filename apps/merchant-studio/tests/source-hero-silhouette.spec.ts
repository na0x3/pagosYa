import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { compileNextPreview, nextProjectScaffold } from '../../api/src/storefront-source/source-next';
import { uiStoreFiles } from '../../api/src/storefront-source/fixtures/ui-store';
import { nextBrief, nextStoreConfig, nextStoreImage } from '../../api/src/storefront-source/fixtures/next-store';
import { kitPath } from '@pagosya/storefront-kit';

/**
 * Two stores must not open with the same picture. `split` and `editorial` used to
 * render the identical copy-left / media-right silhouette, so most generated
 * stores opened the same way whatever direction the plan chose.
 */
const photo = `image={{ src: '/assets/sample.png', alt: 'Manta de alpaca' }}`;
async function openHero(page: import('@playwright/test').Page, hero: string) {
  const authored = uiStoreFiles();
  authored.find(file => file.path === 'components/home.tsx')!.content = `import Shell from './Shell';
import { Hero, Catalog, Button } from '@pagosya/ui';
export default function Home() {
  return <Shell><main id="contenido">
    ${hero}
    <Catalog title="La colección" eyebrow="Tienda" />
  </main></Shell>;
}`;
  const files = [...authored, ...await compileNextPreview(authored), ...nextProjectScaffold('test'), nextStoreImage,
    { path: 'brand.css', content: '/* fixture */' },
    { path: 'config.js', content: `window.PAGOSYA_CONFIG=${JSON.stringify(nextStoreConfig)};` },
    ...['commerce.js', 'commerce-pages.css'].map(path => ({ path, content: readFileSync(kitPath(path), 'utf8') })),
  ];
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?demo=1');
  await page.evaluate(async snapshot => {
    const { sourcePreviewDocument } = await import('/src/storefront-preview.ts' as string);
    document.body.innerHTML = ''; document.body.style.margin = '0';
    const frame = document.createElement('iframe'); frame.sandbox.add('allow-scripts'); frame.title = 'React preview';
    frame.style.cssText = 'width:100%;height:100vh;border:0'; document.body.append(frame);
    frame.srcdoc = sourcePreviewDocument(snapshot, 'index.html', {});
  }, { schemaVersion: 1, brief: nextBrief, files });
  const frame = page.frameLocator('iframe[title="React preview"]');
  await expect(frame.locator('.ui-hero')).toBeVisible();
  return frame;
}
const box = async (locator: ReturnType<ReturnType<typeof test.step> extends never ? never : any>) => (await locator.boundingBox())!;

test('the editorial opening is a banded masthead, not a second split', async ({ page }) => {
  const frame = await openHero(page, `<Hero variant="editorial" title="Abrigo que se hereda" lead="Tejidos en telar." ${photo} actions={<Button href="#productos">Ver</Button>} />`);
  const media = await box(frame.locator('.ui-hero__media'));
  const copy = await box(frame.locator('.ui-hero__copy'));
  const grid = await box(frame.locator('.ui-hero__grid'));
  expect(media.y + media.height).toBeLessThanOrEqual(copy.y + 1);
  expect(media.width).toBeGreaterThan(grid.width * 0.9);
});

test('the split opening keeps copy and photo side by side', async ({ page }) => {
  const frame = await openHero(page, `<Hero variant="split" title="Abrigo que se hereda" lead="Tejidos en telar." ${photo} actions={<Button href="#productos">Ver</Button>} />`);
  const media = await box(frame.locator('.ui-hero__media'));
  const copy = await box(frame.locator('.ui-hero__copy'));
  expect(media.x).toBeGreaterThan(copy.x + copy.width - 2);
  expect(media.width).toBeLessThan((await box(frame.locator('.ui-hero__grid'))).width * 0.75);
});

test('an opening with no photograph never leaves half the row empty', async ({ page }) => {
  const frame = await openHero(page, `<Hero variant="split" title="Abrigo que se hereda" lead="Tejidos en telar." actions={<Button href="#productos">Ver</Button>} />`);
  await expect(frame.locator('.ui-hero')).not.toHaveAttribute('data-variant', 'split');
  const copy = await box(frame.locator('.ui-hero__copy'));
  const hero = await box(frame.locator('.ui-hero'));
  expect(copy.width).toBeGreaterThan(hero.width * 0.6);
});
