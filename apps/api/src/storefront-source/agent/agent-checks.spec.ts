import { withVisualSandbox } from '../source-visual-capture';
import { evaluateRequirements } from './agent-checks';
import { AgentRequirement } from './agent-task';
jest.setTimeout(60_000);
const requirement = (id: string, check: AgentRequirement['check'], selector: string, expected: string): AgentRequirement & { imagePaths: string[] } => ({ id, description: id, page: 'index.html', check, selector, expected, imagePaths: [] });
it('checks root CSS tokens and colors without corrupting the document or its inline styles', async () => {
  const snapshot: any = { schemaVersion: 1, brief: {}, files: [{ path: 'index.html', content: '<html style="--store-accent: #1746a2; color: #1746a2 !important"><body><h1>Luz Papel</h1></body></html>' }] };
  await withVisualSandbox(snapshot, '', undefined, false, async context => {
    const page = await context.newPage(); await page.goto('https://preview.invalid/index.html');
    const before = await page.locator('html').getAttribute('style');
    const evidence = await page.evaluate(evaluateRequirements, { entry: 'index.html', width: 1280, profile: 'normal' as const, requirements: [
      requirement('r1', 'style', ':root', '--store-accent:#1746a2'),
      requirement('r2', 'style', ':root', '--store-accent:red'),
      requirement('r3', 'style', ':root', 'color:rgb(23, 70, 162)'),
      requirement('r4', 'style', 'h1', 'color:#1746a2'),
    ] });
    expect(evidence.map(e => e.passed)).toEqual([true, false, true, true]);
    expect(evidence.every(e => e.kind === 'requirement')).toBe(true);
    expect(await page.locator('html').getAttribute('style')).toBe(before);
    expect(await page.locator('html').count()).toBe(1);
  });
});
it('compares semantic CSS values and separates missing content from invalid checks', async () => {
  const snapshot: any = { schemaVersion: 1, brief: {}, files: [{ path: 'index.html', content: '<style>.logo{color:#146f3d}.hidden{display:none}</style><h1 class="logo">MATCHO</h1><p class="hidden">hidden</p>' }] };
  await withVisualSandbox(snapshot, '', undefined, false, async context => {
    const page = await context.newPage(); await page.goto('https://preview.invalid/index.html');
    const evidence = await page.evaluate(evaluateRequirements, { entry: 'index.html', width: 1280, profile: 'normal' as const, requirements: [requirement('r1', 'style', '.logo', 'color:#146f3d'), requirement('r2', 'style', '.logo', 'color:red'), requirement('r3', 'element', '.hidden', '1'), requirement('r4', 'style', '.logo', 'made-up-property:banana'), requirement('r5', 'element', ':not(', '1')] });
    expect(evidence.map(e => e.passed)).toEqual([true, false, false, false, false]);
    expect(evidence[0].observed).toContain('rgb(20, 111, 61)');
    expect(evidence.map(e => e.kind)).toEqual(['requirement', 'requirement', 'requirement', 'checker-error', 'checker-error']);
    expect(await page.locator('h1').count()).toBe(1);
  }, 'no-preference');
});
it('checks normal video presentation separately from its reduced-motion fallback', async () => {
  const snapshot: any = { schemaVersion: 1, brief: {}, files: [{ path: 'index.html', content: '<style>video{width:300px;height:200px}.poster{display:none}@media(prefers-reduced-motion:reduce){video{display:none}.poster{display:block}}</style><video></video><p class="poster">Static fallback</p>' }] };
  for (const profile of ['normal', 'reduced-motion'] as const) await withVisualSandbox(snapshot, '', undefined, false, async context => {
    const page = await context.newPage(); await page.goto('https://preview.invalid/index.html');
    const evidence = await page.evaluate(evaluateRequirements, { entry: 'index.html', width: 1280, profile, requirements: [requirement('r1', 'element', 'video', '1'), { ...requirement('r2', 'text', '.poster', 'Static fallback'), profile: 'reduced-motion' as const }] });
    expect(evidence).toHaveLength(1); expect(evidence[0].passed).toBe(true);
    expect(evidence[0].profile).toBe(profile);
  }, profile === 'normal' ? 'no-preference' : 'reduce');
});

it('compares the effective primary font without confusing an unused fallback with a different font', async () => {
  const snapshot: any = { schemaVersion: 1, brief: {}, files: [{ path: 'index.html', content: '<h1 style="font-family:system-ui">Store</h1>' }] };
  await withVisualSandbox(snapshot, '', undefined, false, async context => {
    const page = await context.newPage(); await page.goto('https://preview.invalid/index.html');
    const evidence = await page.evaluate(evaluateRequirements, { entry: 'index.html', width: 1280, profile: 'normal' as const, requirements: [requirement('r1', 'style', 'h1', 'font-family:system-ui, sans-serif'), requirement('r2', 'style', 'h1', 'font-family:monospace, sans-serif'), requirement('r3', 'video', 'video', 'assets/missing.mp4')] });
    expect(evidence.map(e => e.passed)).toEqual([true, false, false]);
  }, 'no-preference');
});

it('requires full viewport geometry rather than accepting an eighty-percent hero', async () => {
  const snapshot: any = { schemaVersion: 1, brief: {}, files: [{ path: 'index.html', content: '<style>body{margin:0}.short{height:80vh}.full{height:100vh}</style><section class="short"></section><section class="full"></section>' }] };
  await withVisualSandbox(snapshot, '', undefined, false, async context => {
    const page = await context.newPage(); await page.goto('https://preview.invalid/index.html');
    const evidence = await page.evaluate(evaluateRequirements, { entry: 'index.html', width: 1280, profile: 'normal' as const, requirements: [requirement('r1', 'layout', '.short', 'viewport-cover'), requirement('r2', 'layout', '.full', 'viewport-cover')] });
    expect(evidence.map(e => e.passed)).toEqual([false, true]);
  });
});
it('checks paused media even when the video is hidden and fails a missing target', async () => {
  const snapshot: any = { schemaVersion: 1, brief: {}, files: [{ path: 'index.html', content: '<video style="display:none" src="assets/test.mp4"></video>' }] };
  await withVisualSandbox(snapshot, '', undefined, false, async context => {
    const page = await context.newPage(); await page.goto('https://preview.invalid/index.html');
    const check = { ...requirement('r1', 'video-paused', 'video', 'assets/test.mp4'), profile: 'reduced-motion' as const };
    const evaluate = () => page.evaluate(evaluateRequirements, { entry: 'index.html', width: 1280, profile: 'reduced-motion' as const, requirements: [check, { ...check, id: 'r2', expected: 'assets/other.mp4' }] });
    expect((await evaluate()).map(e=>e.passed)).toEqual([true,false]);
    await page.evaluate(() => Object.defineProperty(document.querySelector('video'), 'paused', {value:false}));
    expect((await evaluate())[0].passed).toBe(false);
  });
});
