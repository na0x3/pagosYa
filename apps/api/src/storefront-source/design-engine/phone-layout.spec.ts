jest.setTimeout(180_000);

import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import { brokenHeadingProblems, captureBrokenHeadings, introducedBrokenHeadings, type BrokenHeading } from './phone-layout';
import { sourceProjectSnapshot } from '../source-project';

const brief = { businessType: 'Test', audience: 'Test', primaryAction: 'Pedir', visualDirection: 'Simple' };
const config = 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ slug: 'test', apiBaseUrl: 'https://preview.invalid', checkoutOrigin: 'https://preview.invalid', productPage: 'product.html', checkoutPage: 'checkout.html', demo: true, data: { storeName: 'Test', checkoutMode: 'contact', items: [] } }) + ';';
const store = async (css: string) => sourceProjectSnapshot({ revision: 1, label: 'Draft', brief, files: [
  { path: 'commerce.js', content: await readFile(kitPath('commerce.js'), 'utf8') },
  { path: 'config.js', content: config },
  { path: 'styles.css', content: css },
  { path: 'package.json', content: '{"name":"test","scripts":{"build":"node build.mjs"}}' }, { path: 'README.md', content: '# Test' },
  { path: 'index.html', content: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"><main><section class="hero"><div class="copy"><h1>El sabor que alegra tus días</h1><p>Panes artesanales.</p></div><div class="visual"></div></section></main><script src="config.js" defer></script><script src="commerce.js" defer></script>' },
] });

// baek (tholhejh) rev 10, 2026-10-16: a later edit re-set the hero to two columns outside any media query, after the
// phone rule, so at 390px the headline sat in a ~70px column, one letter per line.
const base = 'body{margin:0;font:16px sans-serif}h1{font:900 64px/0.9 sans-serif;overflow-wrap:anywhere}.hero{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(280px,.8fr);gap:24px;padding:20px}.visual{min-height:400px;background:#c9875b}';
const phone = '@media (max-width:760px){.hero{grid-template-columns:1fr}}';
const desktopAfterPhone = '.hero{grid-template-columns:minmax(0,1.08fr) minmax(280px,.72fr)}';

it('reports a headline split mid-word on the phone when a desktop rule written after the phone rule undoes it', async () => {
  const broken = await captureBrokenHeadings(await store(base + phone + desktopAfterPhone));
  expect(broken.some(item => item.width === 390)).toBe(true);
  expect(broken.some(item => item.width === 1440)).toBe(false);
  expect(broken[0]).toEqual(expect.objectContaining({ width: 390, heading: expect.stringContaining('El sabor') }));
  expect(broken[0].column).toBeLessThan(120);
});

it('says nothing when the phone rule wins', async () => {
  expect(await captureBrokenHeadings(await store(base + desktopAfterPhone + phone))).toEqual([]);
});

it('keeps only the breaks a save brings in, per width and word', () => {
  const at = (width: number, word: string): BrokenHeading => ({ width, word, heading: 'El sabor', column: 70 });
  expect(introducedBrokenHeadings([at(390, 'sabor'), at(390, 'alegra'), at(1440, 'sabor')], [at(390, 'sabor')])).toEqual([at(390, 'alegra'), at(1440, 'sabor')]);
});

it('words the problem so the model can fix it: width, words, column and the likely cause', () => {
  const problems = brokenHeadingProblems([
    { width: 390, word: 'sabor', heading: 'El sabor que alegra tus días', column: 68 },
    { width: 390, word: 'alegra', heading: 'El sabor que alegra tus días', column: 68 },
  ]);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain('390px');
  expect(problems[0]).toContain('«sabor»');
  expect(problems[0]).toContain('«alegra»');
  expect(problems[0]).toContain('68px');
  expect(problems[0]).toContain('@media');
});
