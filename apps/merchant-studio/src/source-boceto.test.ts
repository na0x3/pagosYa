// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBocetoPanel } from './source-boceto';
import { MerchantStudioApi } from './api';

const sketch = () => ({
  palette: { paper: '#f6ecd9', ink: '#1f2a24', accent: '#e35336', deep: '#1e3a2f', pop: '#f2c94c' },
  fonts: { display: 'anton', text: 'manrope' }, scale: 'm',
  blocks: [
    { id: 'intro', type: 'hero', variant: 'photo-right', headline: 'Algo dulce', sub: 'sub', cta: 'Ver', badge: '', note: '', sticker: '', bg: 'paper', size: 'l' },
    { id: 'cat', type: 'catalog', kicker: '', title: 'Productos', bg: 'pop', size: 'm' },
    { id: 'fin', type: 'footer', tagline: 'fin', wordmark: 'giant', bg: 'deep', size: 'l' },
  ],
});
const version = (withSketch = true) => ({ revision: 3, snapshot: { files: withSketch ? [{ path: 'sketch.json' }, { path: 'components/home.tsx' }] : [{ path: 'components/home.tsx' }] } }) as any;

let host: HTMLDivElement;
let getSketch: ReturnType<typeof vi.spyOn>;
let putSketch: ReturnType<typeof vi.spyOn>;
let applied: any[];
beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.replaceChildren(host);
  applied = [];
  getSketch = vi.spyOn(MerchantStudioApi.prototype, 'getSketch').mockResolvedValue({ revision: 3, sketch: sketch(), photos: ['assets/a.jpg'], fonts: ['anton', 'manrope', 'fraunces'] } as any);
  putSketch = vi.spyOn(MerchantStudioApi.prototype, 'putSketch').mockImplementation(async (_s: any, body: any) => ({ revision: 4, sketch: body.sketch } as any));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const mount = async (withSketch = true) => {
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: version(withSketch), locked: false, saved: vi.fn().mockResolvedValue(undefined), apply: payload => applied.push(payload) });
  await vi.waitFor(() => { if (withSketch && !host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  return panel;
};

it('mounts nothing for a store without sketch.json', async () => {
  await mount(false);
  expect(getSketch).not.toHaveBeenCalled();
  expect(host.innerHTML).toBe('');
});

it('is a properties inspector: no text inputs, text edits live on the canvas', async () => {
  await mount();
  (host.querySelector('[data-boceto-block="intro"] .bct-block__head') as HTMLElement).click();
  expect(host.querySelector('input[type="text"], textarea, input:not([type])')).toBeNull();
  expect(host.textContent).toContain('tocándolo dos veces');
});

it('a background change applies live to the preview and saves silently after the idle window', async () => {
  await mount();
  (host.querySelector('[data-boceto-block="intro"] .bct-block__head') as HTMLElement).click();
  const vivo = [...host.querySelectorAll('.bct-props .bct-segment__option')].find(b => b.textContent === 'Vivo') as HTMLElement;
  vivo.click();
  expect(applied.length).toBeGreaterThan(0);
  const last = applied.at(-1);
  expect(last.blocks.intro.bg).toBe('#f2c94c');
  expect(putSketch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch).toHaveBeenCalledTimes(1);
  expect(putSketch.mock.calls[0][1].sketch.blocks[0].bg).toBe('pop');
});

it('move, add and remote events compose the sketch', async () => {
  const panel = await mount();
  (host.querySelector('[data-boceto-block="cat"] [data-boceto-move-up]') as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls[0][1].sketch.blocks.map((b: any) => b.id)).toEqual(['cat', 'intro', 'fin']);
  (host.querySelector('[data-boceto-add]') as HTMLSelectElement).value = 'marquee';
  (host.querySelector('[data-boceto-add-button]') as HTMLElement).click();
  (panel as any).remoteText('intro', 'headline', 'Desde el canvas');
  await vi.advanceTimersByTimeAsync(1300);
  const blocks = putSketch.mock.calls.at(-1)[1].sketch.blocks;
  expect(blocks.some((b: any) => b.type === 'marquee')).toBe(true);
  expect(blocks.at(-1).type).toBe('footer');
  expect(blocks.find((b: any) => b.id === 'intro').headline).toBe('Desde el canvas');
});

it('renders merchant text through textContent, never markup', async () => {
  getSketch.mockResolvedValue({ revision: 3, sketch: { ...sketch(), blocks: [{ id: 'x', type: 'hero', variant: 'stacked', headline: '<img src=x onerror=alert(1)>', sub: '', cta: '', badge: '', note: '', sticker: '', bg: 'paper', size: 'm' }] }, photos: [], fonts: ['anton'] } as any);
  await mount();
  expect(host.innerHTML).not.toContain('<img src=x');
});
