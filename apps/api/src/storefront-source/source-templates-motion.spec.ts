/// <reference lib="dom" />
import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { withVisualSandbox } from './source-visual-capture';
import { sourceVisualState } from './source-visual-state';

jest.setTimeout(240_000);

const origin = 'https://preview.invalid';
type Snapshot = Awaited<ReturnType<SourceProjectsService['prepare']>>;

/** Scrolls the home page top to bottom and reports what the kit's scroll effects did at each stop. */
function scrollThrough(snapshot: Snapshot, width: number, reducedMotion: 'reduce' | 'no-preference') {
  return withVisualSandbox(snapshot, sourceVisualState(snapshot, 'index.html').query, undefined, false, async context => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${origin}/index.html`, { waitUntil: 'load', timeout: 12000 });
    await page.evaluate(async () => { await document.fonts.ready; });
    const read = () => page.evaluate(() => ({
      parallax: Array.from(document.querySelectorAll('[data-ui-parallax] > div')).map(el => getComputedStyle(el).transform),
      hiddenReveals: Array.from(document.querySelectorAll('[data-ui-reveal]')).filter(el => Number(getComputedStyle(el).opacity) < 1).length,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 1400)))));
    await settle();
    const stops = [await read()];
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 360; y < height; y += 720) {
      await page.evaluate(offset => window.scrollTo(0, offset), y);
      await settle();
      stops.push(await read());
    }
    await page.close();
    return stops;
  }, reducedMotion);
}

/** Every Plantilla moves: the hero drifts on scroll (gently on a phone), sections enter as they're reached, and
 * none of it adds sideways scroll or leaves content hidden — and it all holds still for reduced motion. */
describe.each(listTemplates().map(manifest => [manifest.id, manifest] as const))('plantilla %s con movimiento', (_id, manifest) => {
  let snapshot: Snapshot;

  beforeAll(async () => {
    const assembled = await templateDemoRevision(manifest, templateSourceFiles(manifest.id));
    snapshot = await new SourceProjectsService({} as any).prepare({ revision: 0, ...assembled });
  });

  it('uses the kit parallax with a phone strength and scroll entrances', () => {
    const home = snapshot.files.find(f => f.path === 'components/home.tsx')!.content;
    const kit = home.match(/import\s*\{([^}]*)\}\s*from\s*'@pagosya\/ui'/)?.[1] ?? '';
    expect(kit).toMatch(/\bParallax\b/);
    expect(kit).toMatch(/\b(Reveal|SectionSequence)\b/);
    expect(home).toMatch(/<Parallax\b[^>]*\bmobileStrength=\{\d+\}/);
  });

  it.each([1280, 390])('drifts on scroll at %ipx without sideways scroll or content left hidden', async width => {
    const stops = await scrollThrough(snapshot, width, 'no-preference');
    expect(stops.some(stop => stop.parallax.some((transform, index) => transform !== stops[0].parallax[index]))).toBe(true);
    expect(stops.map(stop => stop.scrollWidth)).toEqual(stops.map(() => width));
    expect(stops.at(-1)!.hiddenReveals).toBe(0);
  });

  it('holds still for reduced motion', async () => {
    const stops = await scrollThrough(snapshot, 390, 'reduce');
    expect(stops.flatMap(stop => stop.parallax).filter(transform => transform !== 'none')).toEqual([]);
    expect(stops.map(stop => stop.hiddenReveals)).toEqual(stops.map(() => 0));
  });
});
