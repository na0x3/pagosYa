jest.setTimeout(90_000);
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { SOURCE_MOTION_TOKENS } from './source-motion-tokens';

/** Sub-project 6: the store's motion personality (html[data-dna-motion]) drives the kit's timing through --motion-* tokens.
 * jsdom drops any stylesheet with @layer, so the resolved tokens and transitions are read in Chromium. */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const motionRuntime = readFileSync(kitPath('motion.js'), 'utf8');
const ui = readFileSync(kitPath('ui.tsx'), 'utf8');
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const ITEM = { id: 'taza', name: 'Taza', amount: 12000, currency: 'BOB', stock: 5, imageUrls: [] };
const DNA = { version: 1, button: 'pill', hover: 'lift', press: 'squash', radius: 'round', border: 'hairline', frame: 'rounded', cart: 'drawer', added: 'toast', review: 'split', card: 'still' };
const CATALOG = '<header><button type="button" data-cart-open>Pedido <span data-cart-count>0</span></button></header><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>';
const PERSONALITIES = Object.keys(SOURCE_MOTION_TOKENS) as Array<keyof typeof SOURCE_MOTION_TOKENS>;

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(options: { dna?: Record<string, unknown>; css?: string; body?: string; settings?: Record<string, unknown>; runtime?: string; reducedMotion?: 'reduce' | 'no-preference' } = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: options.reducedMotion ?? 'no-preference' });
  const config = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, data: { storeName: 'Marca', items: [ITEM] }, ...(options.dna ? { dna: options.dna } : {}), ...options.settings };
  await page.setContent(`<!doctype html><html lang="es"><head><style>${options.css ?? ''}</style></head><body>${options.body ?? CATALOG}</body></html>`);
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
  await page.addScriptTag({ content: options.runtime ?? commerce });
  return page;
}
const rootTokens = (page: Page, names: string[]) => page.evaluate(names => {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(names.map(name => [name, style.getPropertyValue(name).trim()]));
}, names);

describe('motion tokens resolve through the kit CSS', () => {
  it.each(PERSONALITIES)('html[data-dna-motion=%s] resolves every --motion-* token to the table', async personality => {
    const page = await open({ dna: { ...DNA, motion: personality } });
    try {
      const t = SOURCE_MOTION_TOKENS[personality];
      const tokens = await rootTokens(page, ['--motion-ease', '--motion-ease-settle', '--motion-ease-exit', '--motion-ease-settle-exit', '--motion-fast', '--motion-base', '--motion-slow', '--motion-distance', '--motion-stagger', '--motion-parallax', '--motion-press-scale']);
      expect(tokens).toEqual({
        '--motion-ease': t.ease, '--motion-ease-settle': t.settle, '--motion-ease-exit': t.exit, '--motion-ease-settle-exit': t.settleExit,
        '--motion-fast': `${t.fast}ms`, '--motion-base': `${t.base}ms`, '--motion-slow': `${t.slow}ms`, '--motion-distance': `${t.distance}px`,
        '--motion-stagger': `${t.stagger}ms`, '--motion-parallax': String(t.parallax), '--motion-press-scale': String(t.press),
      });
    } finally { await page.close(); }
  });

  it('snappy resolves --motion-base to 200ms, and --ease-out / --ease-drawer / --kit-ease to its settle curve', async () => {
    const page = await open({ dna: { ...DNA, motion: 'snappy' } });
    try {
      expect(await rootTokens(page, ['--motion-base', '--ease-out', '--ease-drawer', '--kit-ease'])).toEqual({ '--motion-base': '200ms', '--ease-out': 'cubic-bezier(.2,.9,.2,1)', '--ease-drawer': 'cubic-bezier(.2,.9,.2,1)', '--kit-ease': 'cubic-bezier(.2,.9,.2,1)' });
    } finally { await page.close(); }
  });

  it('the store\'s own :root tokens win over the personality', async () => {
    const page = await open({ dna: { ...DNA, motion: 'cinematic' }, css: ':root{--motion-base:777ms;--ease-out:linear}' });
    try {
      expect(await rootTokens(page, ['--motion-base', '--ease-out', '--motion-slow'])).toEqual({ '--motion-base': '777ms', '--ease-out': 'linear', '--motion-slow': '900ms' });
    } finally { await page.close(); }
  });

  it('defines no motion token, and leaves --ease-out undefined, for a store without a personality', async () => {
    for (const dna of [undefined, DNA, { ...DNA, motion: 'wobbly' }]) {
      const page = await open({ dna });
      try {
        expect({ dna: dna ? 'dna' : 'none', tokens: await rootTokens(page, ['--motion-base', '--motion-ease', '--ease-out', '--ease-drawer']) })
          .toEqual({ dna: dna ? 'dna' : 'none', tokens: { '--motion-base': '', '--motion-ease': '', '--ease-out': '', '--ease-drawer': '' } });
      } finally { await page.close(); }
    }
  });
});

/** jsdom: records every animate() call the kit makes when a product is added with a pointer. */
function addWithPointer(options: { dna?: Record<string, unknown>; reduce?: boolean; settings?: Record<string, unknown> } = {}) {
  const dom = new JSDOM(`<html><head></head><body>${CATALOG}</body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = (query: string) => ({ matches: /reduce/.test(query) ? Boolean(options.reduce) : /hover/.test(query), addEventListener() {}, removeEventListener() {} });
  const calls: Array<{ el: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions }> = [];
  w.Element.prototype.animate = function (keyframes: Keyframe[], timing: KeyframeAnimationOptions) {
    calls.push({ el: this.matches('[data-cart-count]') ? 'count' : this.tagName.toLowerCase(), keyframes, options: timing });
    return { cancel() {}, finish() {}, pause() {}, play() {}, finished: Promise.resolve() };
  };
  w.Element.prototype.getAnimations = () => [];
  w.PAGOSYA_PREVIEW = true;
  const data = { storeName: 'Marca', items: [ITEM] };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, ...(options.dna ? { dna: options.dna } : {}), ...options.settings };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  const add = w.document.querySelector('[data-pagosya-catalog] [data-add]');
  add.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  w.close();
  return calls;
}

describe('the add pulse takes the personality', () => {
  const pulse = (calls: ReturnType<typeof addWithPointer>) => calls.filter(call => call.el === 'button');
  it('without a personality it is today\'s pulse: 200ms from scale .96 and opacity .65 on cubic-bezier(.23,1,.32,1)', () => {
    for (const dna of [undefined, DNA]) {
      const calls = pulse(addWithPointer({ dna }));
      expect(calls.map(c => [c.keyframes, c.options])).toEqual([
        [[{ transform: 'scale(0.96)' }, { transform: 'scale(1)' }], { duration: 200, easing: 'cubic-bezier(.23,1,.32,1)' }],
        [[{ opacity: 0.65 }, { opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.23,1,.32,1)' }],
      ]);
    }
  });
  it.each(PERSONALITIES)('%s: fast duration, press scale; the transform takes the enter curve, the opacity the settle curve', personality => {
    const t = SOURCE_MOTION_TOKENS[personality];
    const calls = pulse(addWithPointer({ dna: { ...DNA, motion: personality } }));
    expect(calls.map(c => [c.keyframes, c.options])).toEqual([
      [[{ transform: `scale(${t.press})` }, { transform: 'scale(1)' }], { duration: t.fast, easing: t.ease }],
      [[{ opacity: 0.65 }, { opacity: 1 }], { duration: t.fast, easing: t.settle }],
    ]);
  });
  it('clamps a store\'s own out-of-range tokens: press scale 0.85-1, duration 0-900ms', async () => {
    const RECORD = `window.__animations=[];Element.prototype.animate=function(k,o){window.__animations.push({keyframes:k,options:o});return{cancel(){},finished:Promise.resolve()};};`;
    const pulseOf = async (css: string) => {
      const page = await open({ css, dna: { ...DNA, motion: 'playful' }, runtime: `${RECORD}\n${commerce}` });
      try {
        await page.click('.menu-add');
        await page.waitForFunction(() => (window as any).__animations.some((a: any) => String(a.keyframes[0].transform).startsWith('scale')));
        const call = await page.evaluate(() => (window as any).__animations.find((a: any) => String(a.keyframes[0].transform).startsWith('scale')));
        return { from: call.keyframes[0].transform, duration: call.options.duration };
      } finally { await page.close(); }
    };
    expect(await pulseOf(':root{--motion-press-scale:0;--motion-fast:3s}')).toEqual({ from: 'scale(0.85)', duration: 900 });
    expect(await pulseOf(':root{--motion-press-scale:1.4;--motion-fast:-50ms}')).toEqual({ from: 'scale(1)', duration: 0 });
  });
  it('pulses the cart count too', () => {
    expect(addWithPointer({ dna: { ...DNA, motion: 'snappy' } }).filter(call => call.el === 'count')).toHaveLength(2);
  });
});

describe('overshoot stays on transforms', () => {
  it('every var(--motion-ease) or var(--motion-ease-exit) in kit CSS times a transform, never another property', () => {
    for (const [file, source] of [['commerce.js', commerce], ['motion.js', motionRuntime], ['ui.tsx', ui]] as const) {
      const uses = [...source.matchAll(/var\(--motion-ease(?:-exit)?[,)]/g)];
      for (const use of uses) {
        const before = source.slice(Math.max(0, use.index! - 120), use.index);
        // The notice's hide curves are a timing-function list in the order of its transition: opacity, transform, visibility.
        if (before.endsWith('.cart-added:not([data-visible=true]){transition-timing-function:var(--motion-ease-settle-exit),')) {
          expect(commerce).toMatch(/\.cart-added\{[^}]*transition:opacity var[^}]*\),transform var[^}]*\),visibility var/);
          continue;
        }
        const property = before.match(/([a-z-]+)\s+var\(--motion-(?:fast|base|slow)(?:,[^()]*(?:\([^()]*\))?)?\)\s+$/)?.[1];
        expect({ file, at: before.slice(-60), property }).toEqual({ file, at: before.slice(-60), property: 'transform' });
      }
    }
  });
});

describe('kit transitions take the personality in the browser', () => {
  const timing = (page: Page, selector: string) => page.evaluate(selector => {
    const style = getComputedStyle(document.querySelector(selector)!);
    return { duration: style.transitionDuration, easing: style.transitionTimingFunction };
  }, selector);
  it('the cart drawer keeps today\'s 250/200ms without a personality and follows it with one', async () => {
    for (const [dna, duration] of [[undefined, '0.25s, 0.2s, 0.25s, 0.25s'], [DNA, '0.25s, 0.2s, 0.25s, 0.25s'], [{ ...DNA, motion: 'cinematic' }, '0.52s, 0.26s, 0.52s, 0.52s'], [{ ...DNA, motion: 'snappy' }, '0.2s, 0.12s, 0.2s, 0.2s']] as const) {
      const page = await open({ dna });
      try {
        await page.waitForSelector('.menu-add');
        expect({ dna: (dna as any)?.motion ?? String(Boolean(dna)), duration: (await timing(page, '.cart-drawer')).duration }).toEqual({ dna: (dna as any)?.motion ?? String(Boolean(dna)), duration });
      } finally { await page.close(); }
    }
  });
  it('the cart drawer never overshoots, not even for playful, and closes on the settle exit curve', async () => {
    const page = await open({ dna: { ...DNA, motion: 'playful' } });
    try {
      await page.waitForSelector('.menu-add');
      expect((await timing(page, '.cart-drawer')).easing).toBe('cubic-bezier(0.5, 0, 0.75, 0)'); // one curve, repeated for every transitioned property
      await page.click('[data-cart-open]');
      await page.waitForSelector('.cart-drawer[open]');
      expect((await timing(page, '.cart-drawer')).easing).toBe('cubic-bezier(0.22, 1, 0.36, 1), cubic-bezier(0.22, 1, 0.36, 1), ease, ease');
    } finally { await page.close(); }
  });
  it('the added notice keeps 200ms without a personality and takes the fast token with one', async () => {
    for (const [dna, duration] of [[undefined, '0.2s, 0.2s, 0.2s'], [{ ...DNA, motion: 'snappy' }, '0.12s, 0.12s, 0.12s']] as const) {
      const page = await open({ dna });
      try {
        await page.waitForSelector('.menu-add');
        expect((await timing(page, '.cart-added')).duration).toBe(duration);
      } finally { await page.close(); }
    }
  });
  it('the playful notice slides on its overshoot curves, except the ribbon, which hangs from the screen edge', async () => {
    for (const [added, easing] of [['toast', 'cubic-bezier(0.5, 0, 0.75, 0), cubic-bezier(0.36, 0, 0.66, -0.56), linear'], ['ribbon', 'cubic-bezier(0.5, 0, 0.75, 0), cubic-bezier(0.5, 0, 0.75, 0), linear']] as const) {
      const page = await open({ dna: { ...DNA, added, motion: 'playful' } });
      try {
        await page.waitForSelector('.menu-add');
        expect({ added, easing: (await timing(page, '.cart-added')).easing }).toEqual({ added, easing });
      } finally { await page.close(); }
    }
  });
  it('the DNA button transitions keep their literals without a personality and follow it with one', async () => {
    for (const [dna, duration] of [[DNA, '0.16s, 0.16s, 0.48s, 0.24s, 0.16s'], [{ ...DNA, motion: 'snappy' }, '0.12s, 0.12s, 0.32s, 0.2s, 0.12s']] as const) {
      const page = await open({ dna });
      try {
        await page.waitForSelector('.menu-add');
        expect((await timing(page, '.menu-add')).duration).toBe(duration);
      } finally { await page.close(); }
    }
  });
});

describe('motion.js reveals and card hover take the personality', () => {
  const REVEAL_BODY = `${CATALOG}<main><section style="height:1600px"><p>Inicio</p></section><section><h2 id="reveal">Nuestra historia</h2></section></main>`;
  const RECORD = `window.__animations=[];const __animate=Element.prototype.animate;Element.prototype.animate=function(k,o){window.__animations.push({id:this.id,keyframes:k,options:o});return __animate.call(this,k,o);};`;
  async function reveal(motion: 'subtle' | 'expressive', personality?: string, css?: string) {
    const page = await open({ css, dna: personality ? { ...DNA, motion: personality } : undefined, settings: { motion }, body: REVEAL_BODY, runtime: `${RECORD}\n${commerce}\n${motionRuntime}` });
    try {
      await page.waitForSelector('.menu-add');
      await page.evaluate(() => document.getElementById('reveal')!.scrollIntoView());
      await page.waitForFunction(() => (window as any).__animations.some((a: any) => a.id === 'reveal'));
      const call = await page.evaluate(() => (window as any).__animations.find((a: any) => a.id === 'reveal'));
      return { duration: call.options.duration, easing: call.options.easing, from: call.keyframes[0].transform };
    } finally { await page.close(); }
  }
  it('keeps today\'s reveals without a personality: 220ms/6px subtle, 280ms/10px expressive', async () => {
    expect(await reveal('subtle')).toEqual({ duration: 220, easing: 'cubic-bezier(.23,1,.32,1)', from: 'translateY(6px)' });
    expect(await reveal('expressive')).toEqual({ duration: 280, easing: 'cubic-bezier(.23,1,.32,1)', from: 'translateY(10px)' });
  });
  it('expressive reveals take the base duration and the full distance; subtle the fast duration and half; always the settle curve', async () => {
    expect(await reveal('expressive', 'cinematic')).toEqual({ duration: 520, easing: 'cubic-bezier(.16,1,.3,1)', from: 'translateY(28px)' });
    expect(await reveal('subtle', 'cinematic')).toEqual({ duration: 260, easing: 'cubic-bezier(.16,1,.3,1)', from: 'translateY(14px)' });
    expect(await reveal('expressive', 'playful')).toEqual({ duration: 360, easing: 'cubic-bezier(.22,1,.36,1)', from: 'translateY(18px)' });
  });
  it('clamps a store\'s own out-of-range tokens like @pagosya/ui: durations 0-900ms, travel 0-40px', async () => {
    const css = ':root{--motion-base:3s;--motion-fast:-40ms;--motion-distance:200px}';
    expect(await reveal('expressive', 'snappy', css)).toEqual(expect.objectContaining({ duration: 900, from: 'translateY(40px)' }));
    expect(await reveal('subtle', undefined, css)).toEqual(expect.objectContaining({ duration: 0, from: 'translateY(20px)' }));
  });
  it('the card photo hover keeps 160ms without a personality and takes the fast token with one', async () => {
    for (const [personality, duration] of [[undefined, '0.16s'], ['snappy', '0.12s']] as const) {
      const page = await open({ dna: personality ? { ...DNA, motion: personality } : DNA, settings: { motion: 'subtle' }, runtime: `${commerce}\n${motionRuntime}` });
      try {
        await page.waitForSelector('.menu-item__image, .menu-add');
        const value = await page.evaluate(() => {
          const img = document.createElement('img'); img.className = 'menu-item__image';
          (document.querySelector('.menu-item') ?? document.body).append(img);
          return getComputedStyle(img).transitionDuration;
        });
        expect({ personality, value }).toEqual({ personality, value: duration });
      } finally { await page.close(); }
    }
  });
});

describe('reduced motion and motion off stop every personality', () => {
  it.each(PERSONALITIES)('%s: no add pulse with reduced motion or with motion off', personality => {
    expect(addWithPointer({ dna: { ...DNA, motion: personality }, reduce: true })).toEqual([]);
    expect(addWithPointer({ dna: { ...DNA, motion: personality }, settings: { motion: 'off' } })).toEqual([]);
  });
  const durations = (page: Page) => page.evaluate(() => Object.fromEntries(['.cart-drawer', '.cart-added', '.menu-add'].map(selector => [selector, getComputedStyle(document.querySelector(selector)!).transitionDuration.split(', ').every(d => d === '0s')])));
  it.each(PERSONALITIES)('%s: with reduced motion the cart, the notice and the buttons have no transition (kit runtime alone)', async personality => {
    for (const added of ['toast', 'ribbon']) {
      const page = await open({ dna: { ...DNA, added, motion: personality }, reducedMotion: 'reduce' });
      try {
        await page.waitForSelector('.menu-add');
        expect({ added, still: await durations(page) }).toEqual({ added, still: { '.cart-drawer': true, '.cart-added': true, '.menu-add': true } });
      } finally { await page.close(); }
    }
  });
  it.each(PERSONALITIES)('%s: a keyboard add shows the notice instantly', async personality => {
    const page = await open({ dna: { ...DNA, motion: personality } });
    try {
      await page.waitForSelector('.menu-add');
      await page.focus('.menu-add');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.cart-added[data-visible="true"]');
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('.cart-added')!).transitionDuration.split(', ').every(d => d === '0s'))).toBe(true);
    } finally { await page.close(); }
  });
  it.each(PERSONALITIES)('%s: with motion off and the motion runtime, nothing transitions or reveals', async personality => {
    const page = await open({ dna: { ...DNA, motion: personality }, settings: { motion: 'off' }, runtime: `${commerce}\n${motionRuntime}` });
    try {
      await page.waitForSelector('.menu-add');
      expect(await durations(page)).toEqual({ '.cart-drawer': true, '.cart-added': true, '.menu-add': true });
    } finally { await page.close(); }
  });
});
