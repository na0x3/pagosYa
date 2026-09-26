jest.setTimeout(60_000);
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { kitPath } from '@pagosya/storefront-kit';
import { SOURCE_MOTION_TOKENS } from './source-motion-tokens';

/** Sub-project 6: @pagosya/ui components take their timing from the store's motion personality. The components are
 * bundled with esbuild and run in jsdom; every animate() call is recorded. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const ui = readFileSync(kitPath('ui.tsx'), 'utf8');
const PERSONALITIES = Object.keys(SOURCE_MOTION_TOKENS) as Array<keyof typeof SOURCE_MOTION_TOKENS>;
const bundles = new Map<string, Promise<string>>();

function bundle(jsx: string): Promise<string> {
  if (!bundles.has(jsx)) bundles.set(jsx, build({
    stdin: { contents: `import { createRoot } from 'react-dom/client'; import { flushSync } from 'react-dom'; import * as UI from ${JSON.stringify(kitPath('ui.tsx'))};\nconst { EntranceGroup, Reveal, PageEntrance, BrandEntrance, SignatureStrokeEntrance, Parallax, SiteHeader } = UI;\nflushSync(() => createRoot(document.getElementById('root')!).render(<>${jsx}</>));`, sourcefile: 'entry.tsx', resolveDir: __dirname, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2022', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
    plugins: [{ name: 'deps', setup(builder) { builder.onResolve({ filter: /^(react|react-dom|react\/jsx-runtime|react-dom\/client|motion\/react|lenis)$/ }, args => ({ path: require.resolve(args.path) })); } }],
  }).then(result => result.outputFiles[0].text));
  return bundles.get(jsx)!;
}

type Call = { id: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions };
async function run(jsx: string, options: { personality?: string; viaConfig?: boolean; reduce?: boolean; motion?: string; after?: (w: any) => void } = {}) {
  const code = await bundle(jsx);
  const attribute = options.personality && !options.viaConfig ? ` data-dna-motion="${options.personality}"` : '';
  const dom = new JSDOM(`<html${attribute}><body><div id="root"></div></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  const calls: Call[] = [];
  w.matchMedia = (query: string) => ({ matches: /reduce/.test(query) ? Boolean(options.reduce) : false, addEventListener() {}, removeEventListener() {} });
  w.Element.prototype.animate = function (keyframes: Keyframe[], timing: KeyframeAnimationOptions) {
    calls.push({ id: this.id || this.className || this.tagName.toLowerCase(), keyframes, options: timing });
    return { cancel() {}, finish() {}, pause() {}, play() {}, finished: new Promise(() => {}) };
  };
  w.IntersectionObserver = class { constructor(private cb: (entries: unknown[]) => void) {} observe(target: Element) { setTimeout(() => this.cb([{ isIntersecting: true, target }]), 0); } disconnect() {} unobserve() {} };
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  w.PAGOSYA_CONFIG = { motion: options.motion ?? 'expressive', ...(options.viaConfig ? { dna: { version: 1, motion: options.personality } } : {}) };
  w.eval(code);
  await new Promise(resolve => setTimeout(resolve, 30));
  options.after?.(w);
  await new Promise(resolve => setTimeout(resolve, 30));
  const html = w.document.body.innerHTML;
  w.close();
  return { calls, html };
}
const group = (count: number, props = '') => `<EntranceGroup${props}>${Array.from({ length: count }, (_, i) => `<p id="g${i}">${i}</p>`).join('')}</EntranceGroup>`;
const summary = (call: Call) => ({ duration: call.options.duration, delay: call.options.delay, from: (call.keyframes[0] as any).transform });

describe('@pagosya/ui motion personality', () => {
  it('carries the same token table as the API (the JS mirror)', () => {
    expect(runInNewContext(`(${ui.match(/const MOTION_PERSONALITIES[^=]*= (\{[\s\S]*?\n\});/)![1]})`)).toEqual(SOURCE_MOTION_TOKENS);
  });

  it('without a personality keeps today\'s timing: EntranceGroup 320ms/20px/60ms, Reveal 500ms/28px', async () => {
    const { calls } = await run(`${group(2)}<Reveal><p>r</p></Reveal>`);
    expect(calls.filter(c => c.id.startsWith('g')).map(summary)).toEqual([{ duration: 320, delay: 0, from: 'translateY(20px)' }, { duration: 320, delay: 60, from: 'translateY(20px)' }]);
    expect(calls.filter(c => !c.id.startsWith('g')).map(summary)).toEqual([{ duration: 500, delay: 0, from: 'translateY(28px)' }]);
  });

  it('snappy: EntranceGroup 200ms/8px/35ms, Reveal 320ms/8px', async () => {
    const { calls } = await run(`${group(2)}<Reveal><p>r</p></Reveal>`, { personality: 'snappy' });
    expect(calls.filter(c => c.id.startsWith('g')).map(summary)).toEqual([{ duration: 200, delay: 0, from: 'translateY(8px)' }, { duration: 200, delay: 35, from: 'translateY(8px)' }]);
    expect(calls.filter(c => !c.id.startsWith('g')).map(summary)).toEqual([{ duration: 320, delay: 0, from: 'translateY(8px)' }]);
  });

  it('reads the personality from PAGOSYA_CONFIG.dna before commerce.js has set the attribute', async () => {
    const { calls } = await run('<Reveal><p>r</p></Reveal>', { personality: 'cinematic', viaConfig: true });
    expect(calls.map(summary)).toEqual([{ duration: 900, delay: 0, from: 'translateY(28px)' }]);
  });

  it('an explicit stagger is the author\'s choice and wins over the personality', async () => {
    const { calls } = await run(group(2, ' stagger={40}'), { personality: 'cinematic' });
    expect(calls.map(c => c.options.delay)).toEqual([0, 40]);
  });

  it.each(PERSONALITIES)('%s: the full-screen openings are retired: no veil, no store name over the page, nothing animates', async personality => {
    const { calls, html } = await run('<BrandEntrance name="Marca" duration={1000} /><PageEntrance variant="wordmark" mark="Marca" /><PageEntrance variant="curtain" /><SignatureStrokeEntrance />', { personality });
    expect(calls).toEqual([]);
    expect(html).toBe('<div id="root"></div>');
  });

  it.each(PERSONALITIES)('%s: the hero copy entrance stays within 1000ms', async personality => {
    const { calls } = await run(group(12, ' delay={600}'), { personality });
    expect(calls).toHaveLength(12);
    expect(Math.max(...calls.map(c => Number(c.options.delay) + Number(c.options.duration)))).toBeLessThan(1000);
  });
  it('multiplies the parallax strength by the personality (cinematic ×1.3), and keeps it without one', async () => {
    expect((await run('<Parallax strength={60}><img alt="" /></Parallax>')).html).toContain('translateY(60px)');
    expect((await run('<Parallax strength={60}><img alt="" /></Parallax>', { personality: 'cinematic' })).html).toContain('translateY(78px)');
  });

  it('opens the overlay menu on the base token and closes it on the fast token and the settle exit curve', async () => {
    const header = '<SiteHeader name="Marca" menu="overlay" links={[{ label: "Tienda", href: "#t" }]} />';
    const click = (w: any, selector: string) => w.document.querySelector(selector).dispatchEvent(new w.MouseEvent('click', { bubbles: true, detail: 1 }));
    const openAndClose = (w: any) => { click(w, '.ui-overlay-trigger'); click(w, '.ui-overlay-menu__bar button'); };
    const today = (await run(header, { after: openAndClose })).calls.map(c => [c.options.duration, c.options.easing]);
    expect(today).toEqual([[240, 'cubic-bezier(.22,1,.36,1)'], [220, 'cubic-bezier(.22,1,.36,1)']]);
    const playful = (await run(header, { personality: 'playful', after: openAndClose })).calls.map(c => [c.options.duration, c.options.easing]);
    expect(playful).toEqual([[360, 'cubic-bezier(.22,1,.36,1)'], [200, 'cubic-bezier(.5,0,.75,0)']]);
  });
});

describe('reduced motion and motion off stop every personality in @pagosya/ui', () => {
  const everything = `${group(3)}<Reveal><p>r</p></Reveal><BrandEntrance name="Marca" /><SiteHeader name="Marca" menu="overlay" links={[{ label: "Tienda", href: "#t" }]} />`;
  const openMenu = (w: any) => w.document.querySelector('.ui-overlay-trigger').dispatchEvent(new w.MouseEvent('click', { bubbles: true, detail: 1 }));
  it.each(PERSONALITIES)('%s: nothing animates with reduced motion or with motion off', async personality => {
    expect((await run(everything, { personality, reduce: true, after: openMenu })).calls).toEqual([]);
    expect((await run(everything, { personality, motion: 'off', after: openMenu })).calls).toEqual([]);
    expect((await run(everything, { personality, after: openMenu })).calls.length).toBeGreaterThan(0);
  });
  it('the CSS scroll reveals stay gated on reduced motion and motion off', () => {
    const css = ui.match(/const UI_CSS = `([\s\S]*?)\n`;/)![1];
    expect(css).toContain('@media (prefers-reduced-motion:no-preference){\n    :root:not([data-ui-motion=off]) .ui-reveal{animation:ui-reveal');
    expect(css).not.toMatch(/\.ui-entrance[{_ ]/);
  });
});
