jest.setTimeout(60_000);
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectStoreSample, kitDefaultSnapshot, snapshotFromDirectory, staticMotionHooks, staticMotionTokens } from './source-scorecard-capture';
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
  expect(sample.surfaces.page).toEqual({ motionHooks: 0, motionTokens: 0 });
  expect(sample.quality).toEqual(expect.objectContaining({ shopping: 'passed', overflow: { desktop: false, mobile: false }, fontsLoaded: true, missingImages: 0 }));
  expect(sample.quality.buyContrast).toBeGreaterThan(4.5);
  expect(screenshots.map(s => s.name)).toEqual(['added-desktop', 'cart-desktop', 'added-mobile', 'cart-mobile']);
});

it('sees a restyled button and the store DNA', async () => {
  const kit = await kitDefaultSnapshot();
  const styled = { ...kit, files: kit.files.map(f => f.path === 'index.html' ? { ...f, content: f.content.replace('</head>', '<style>.menu-item .menu-add[data-add]{border-radius:999px!important;text-transform:uppercase;letter-spacing:.2em;height:56px!important;border:3px solid #000!important}</style></head>') }
    : f.path === 'config.js' ? { ...f, content: f.content.replace('"demo":true', '"demo":true,"dna":{"version":1,"button":"pill","cart":"sheet","motion":"snappy"}') } : f) };
  const [base, restyled] = await Promise.all([kit, styled].map((snapshot, i) => collectStoreSample({ id: String(i), name: String(i), snapshot })));
  expect(surfaceDistance(base.sample.surfaces.button!, restyled.sample.surfaces.button!)).toBeGreaterThan(0.25);
  expect(restyled.sample.surfaces.page).toEqual(expect.objectContaining({ 'dna.button': 'pill', 'dna.cart': 'sheet', 'dna.motion': 'snappy' }));
});

it('measures the DNA kit surfaces apart from each other and from the kit default', async () => {
  const kit = await kitDefaultSnapshot();
  const withDna = (dna: Record<string, string>) => ({ ...kit, files: kit.files.map(f => f.path === 'config.js' ? { ...f, content: f.content.replace('"demo":true', `"demo":true,"dna":${JSON.stringify({ version: 1, ...dna })}`) } : f) });
  const a = { button: 'pill', hover: 'lift', press: 'squash', radius: 'round', border: 'hairline', frame: 'rounded', cart: 'sheet', added: 'ribbon', review: 'ticket', card: 'zoom' };
  const b = { button: 'stamp', hover: 'invert', press: 'pop', radius: 'none', border: 'bold', frame: 'polaroid', cart: 'overlay', added: 'bubble', review: 'stacked', card: 'quick-look' };
  const [base, first, second] = await Promise.all([kit, withDna(a), withDna(b)].map((snapshot, i) => collectStoreSample({ id: String(i), name: String(i), snapshot })));
  for (const surface of ['cart', 'added', 'review', 'card', 'button'] as const) {
    const distances = { surface, pair: surfaceDistance(first.sample.surfaces[surface]!, second.sample.surfaces[surface]!), a: surfaceDistance(first.sample.surfaces[surface]!, base.sample.surfaces[surface]!), b: surfaceDistance(second.sample.surfaces[surface]!, base.sample.surfaces[surface]!) };
    expect({ surface, far: Math.min(distances.pair, distances.a, distances.b) >= 0.25, distances }).toEqual({ surface, far: true, distances });
  }
  expect(first.sample.surfaces.cart).toEqual(expect.objectContaining({ position: 'bottom' }));
  expect(second.sample.surfaces.cart).toEqual(expect.objectContaining({ position: 'centered' }));
  expect(first.sample.surfaces.card).toEqual(expect.objectContaining({ hover: 'scale' }));
  expect(second.sample.surfaces.card).toEqual(expect.objectContaining({ hover: 'chip' }));
  expect(first.sample.errors).toEqual([]);
  // Press, the notice's top border and the typeface each surface renders in are measured too.
  expect([first.sample.surfaces.button!.press, second.sample.surfaces.button!.press]).toEqual([expect.stringContaining('matrix'), expect.stringContaining('matrix')]);
  expect(first.sample.surfaces.button!.press).not.toBe(second.sample.surfaces.button!.press);
  expect([first.sample.surfaces.added!.border, second.sample.surfaces.added!.border]).toEqual([1, 2]); // hairline; bold 2.5px snaps to 2 device pixels
  for (const surface of ['cart', 'review', 'added', 'card'] as const) expect(first.sample.surfaces[surface]).toEqual(expect.objectContaining({ font: expect.any(String) }));
  expect([first.sample.surfaces.review!.summaryPaint, second.sample.surfaces.review!.summaryPaint]).toEqual(['perforated', 'flat']);
  expect(first.sample.surfaces.review!.pad).toEqual(expect.any(Number));
  expect([first.sample.surfaces.review!.titleTracking, first.sample.surfaces.cart!.titleTracking]).toEqual([expect.any(Number), expect.any(Number)]);
  expect(first.sample.surfaces.card).toEqual(expect.objectContaining({ addTracking: expect.any(Number), addTransform: expect.stringContaining('/') }));
});

it('records tracking in em and background deltas as lightness (ΔL*), so the scorecard can quantize them', async () => {
  const kit = await kitDefaultSnapshot();
  const withDna = (dna: Record<string, string>) => ({ ...kit, files: kit.files.map(f => f.path === 'config.js' ? { ...f, content: f.content.replace('"demo":true', `"demo":true,"dna":${JSON.stringify({ version: 1, ...dna })}`) } : f) });
  const { sample } = await collectStoreSample({ id: 'x', name: 'x', snapshot: withDna({ button: 'block', case: 'upper', tracking: 'wide', cart: 'sheet', added: 'toast', review: 'ticket', radius: 'soft', border: 'hairline', frame: 'bleed', card: 'still', hover: 'lift', press: 'none' }) });
  expect(sample.errors).toEqual([]);
  expect([sample.surfaces.cart!.titleTracking, sample.surfaces.review!.titleTracking]).toEqual([0.1, 0.14]); // wide .1em; the ticket title's own .14em
  expect([sample.surfaces.button!.tracking, sample.surfaces.card!.addTracking]).toEqual([0.09, 0.09]); // block: .09em
  // The sheet is the kit surface tint (5% ink on white): a few L* points, not a ΔY of a few hundredths.
  expect(sample.surfaces.cart!.bgDelta).toBeGreaterThan(1);
  expect(sample.surfaces.cart!.bgDelta).toBeLessThan(10);
});

it('does not count a deferred second photo (no src until the shopper reaches the card) as a missing image', async () => {
  const kit = await kitDefaultSnapshot();
  const files = kit.files.map(f => {
    if (f.path === 'config.js') {
      const config = JSON.parse(f.content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;$/, ''));
      config.data.items = config.data.items.map((item: any) => ({ ...item, imageUrls: [...item.imageUrls, 'assets/p2.svg'] }));
      config.dna = { version: 1, card: 'second-photo', button: 'pill', cart: 'drawer', added: 'toast', review: 'split' };
      return { ...f, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};` };
    }
    // Authored card CSS commonly sizes every card image, the deferred one included.
    return f.path === 'index.html' ? { ...f, content: f.content.replace('</head>', '<style>.menu-item img{display:block;width:100%;height:220px}</style></head>') } : f;
  });
  const { sample } = await collectStoreSample({ id: 'x', name: 'x', snapshot: { ...kit, files } });
  expect(sample.quality.missingImages).toBe(0);
  expect(sample.surfaces.card!.hover).toBe('swap');
});

it('measures the cart with the product in it when the home page cannot add to the cart', async () => {
  const kit = await kitDefaultSnapshot();
  const noCatalog = { ...kit, files: kit.files.map(f => f.path === 'index.html' ? { ...f, content: f.content.replace('<div data-pagosya-catalog data-pagosya-grid></div>', '') } : f) };
  const { sample } = await collectStoreSample({ id: 'n', name: 'n', snapshot: noCatalog });
  expect(sample.surfaces.cart).toEqual(expect.objectContaining({ stepRadius: expect.any(Number) }));
  expect(sample.surfaces.cart!.stepRadius).toBeGreaterThanOrEqual(0);
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

it('counts the store\'s own --motion-* token uses, not the kit\'s or compiled output', () => {
  const files = [
    { path: 'styles.css', content: '.a{transition:transform var(--motion-base,300ms) var(--motion-ease,ease)}.b{animation-duration:var(--motion-slow)}' },
    { path: 'components/home.tsx', content: 'el.animate(k, { duration: 400 }); const d = "var(--motion-fast, 120ms)";' },
    { path: 'commerce.js', content: 'var(--motion-base,250ms) var(--motion-fast,200ms)' },
    { path: '_compiled/home.js', content: 'var(--motion-base)' },
  ];
  expect(staticMotionTokens(files as any)).toBe(4);
});
