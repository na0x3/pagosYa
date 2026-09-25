jest.setTimeout(60_000);
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectStoreSample, kitDefaultSnapshot, snapshotFromDirectory, staticMotionHooks } from './source-scorecard-capture';
import { SURFACE_NAMES, surfaceDistance } from './source-scorecard';

it('collects every surface for the kit default store, with clean quality', async () => {
  const { sample, screenshots } = await collectStoreSample({ id: 'kit', name: 'Kit default', snapshot: await kitDefaultSnapshot() }, { screenshots: true });
  expect(sample.errors).toEqual([]);
  for (const surface of SURFACE_NAMES) expect(Object.keys(sample.surfaces[surface] ?? {}).length).toBeGreaterThan(0);
  expect(sample.surfaces.button).toEqual(expect.objectContaining({ radius: expect.any(Number), height: expect.any(Number), font: expect.any(String), 'm.height': expect.any(Number) }));
  expect(sample.surfaces.cart).toEqual(expect.objectContaining({ position: 'right', 'm.width': 1 }));
  expect(sample.surfaces.added).toEqual(expect.objectContaining({ position: 'bottom-right' }));
  expect(sample.surfaces.product).toEqual(expect.objectContaining({ style: expect.any(String), gallery: expect.any(String) }));
  expect(sample.surfaces.review).toEqual(expect.objectContaining({ columns: 2, summary: expect.any(String), 'm.columns': 1 }));
  expect(sample.surfaces.page).toEqual({ motionHooks: 0 });
  expect(sample.quality).toEqual(expect.objectContaining({ shopping: 'passed', overflow: { desktop: false, mobile: false }, fontsLoaded: true, missingImages: 0 }));
  expect(sample.quality.buyContrast).toBeGreaterThan(4.5);
  expect(screenshots.map(s => s.name)).toEqual(['added-desktop', 'cart-desktop', 'added-mobile', 'cart-mobile']);
});

it('sees a restyled button and the store DNA', async () => {
  const kit = await kitDefaultSnapshot();
  const styled = { ...kit, files: kit.files.map(f => f.path === 'index.html' ? { ...f, content: f.content.replace('</head>', '<style>.menu-item .menu-add[data-add]{border-radius:999px!important;text-transform:uppercase;letter-spacing:.2em;height:56px!important;border:3px solid #000!important}</style></head>') }
    : f.path === 'config.js' ? { ...f, content: f.content.replace('"demo":true', '"demo":true,"dna":{"version":1,"button":"pill","cart":"sheet"}') } : f) };
  const [base, restyled] = await Promise.all([kit, styled].map((snapshot, i) => collectStoreSample({ id: String(i), name: String(i), snapshot })));
  expect(surfaceDistance(base.sample.surfaces.button!, restyled.sample.surfaces.button!)).toBeGreaterThan(0.25);
  expect(restyled.sample.surfaces.page).toEqual(expect.objectContaining({ 'dna.button': 'pill', 'dna.cart': 'sheet' }));
});

it('counts motion hooks in authored files only', () => {
  expect(staticMotionHooks([
    { path: 'index.html', content: '<style>@keyframes a{} @keyframes b{}</style><script>new IntersectionObserver(()=>{});el.animate([])</script>', encoding: 'utf8' },
    { path: 'components/home.tsx', content: '<Parallax><Reveal/></Parallax><Marquee/>', encoding: 'utf8' },
    { path: 'motion.js', content: 'IntersectionObserver animate(', encoding: 'utf8' },
    { path: '_compiled/home.js', content: 'Parallax Reveal', encoding: 'utf8' },
  ])).toBe(7);
});

it('reads an exported site folder, binaries as base64', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scorecard-'));
  await mkdir(join(dir, 'assets'));
  await writeFile(join(dir, 'index.html'), '<h1>x</h1>');
  await writeFile(join(dir, 'assets', 'a.png'), Buffer.from([137, 80, 78, 71]));
  const snapshot = await snapshotFromDirectory(dir);
  expect(snapshot.files).toEqual(expect.arrayContaining([
    { path: 'index.html', content: '<h1>x</h1>', encoding: 'utf8' },
    { path: 'assets/a.png', content: Buffer.from([137, 80, 78, 71]).toString('base64'), encoding: 'base64' },
  ]));
});
