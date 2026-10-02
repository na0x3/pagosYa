// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBocetoPanel } from './source-boceto';
import { MerchantStudioApi } from './api';

const sketch = () => ({
  palette: { paper: '#f6ecd9', ink: '#1f2a24', accent: '#e35336', deep: '#1e3a2f', pop: '#f2c94c' },
  fonts: { display: 'anton', text: 'manrope' }, scale: 'm',
  blocks: [
    { id: 'intro', type: 'hero', variant: 'photo-right', headline: 'Algo dulce', sub: 'sub', cta: 'Ver', bg: 'paper', size: 'l' },
    { id: 'cat', type: 'catalog', kicker: '', title: 'Productos', bg: 'pop', size: 'm' },
    { id: 'fin', type: 'footer', tagline: 'fin', wordmark: 'giant', bg: 'deep', size: 'l' },
  ],
});
const version = (withSketch = true) => ({ revision: 3, snapshot: { files: withSketch ? [{ path: 'sketch.json' }, { path: 'components/home.tsx' }] : [{ path: 'components/home.tsx' }] } }) as any;

let host: HTMLDivElement;
let getSketch: ReturnType<typeof vi.spyOn>;
let putSketch: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.replaceChildren(host);
  getSketch = vi.spyOn(MerchantStudioApi.prototype, 'getSketch').mockResolvedValue({ revision: 3, sketch: sketch(), photos: ['assets/a.jpg'], fonts: ['anton', 'manrope', 'fraunces'] } as any);
  putSketch = vi.spyOn(MerchantStudioApi.prototype, 'putSketch').mockImplementation(async (_s: any, body: any) => ({ revision: 4, sketch: body.sketch } as any));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const mount = async (withSketch = true) => {
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: version(withSketch), locked: false, saved: vi.fn().mockResolvedValue(undefined) });
  await vi.waitFor(() => { if (withSketch && !host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  return panel;
};

it('mounts nothing for a store without sketch.json', async () => {
  await mount(false);
  expect(getSketch).not.toHaveBeenCalled();
  expect(host.innerHTML).toBe('');
});

it('lists the blocks and saves a debounced text edit, re-rendering from the response', async () => {
  await mount();
  expect(host.querySelectorAll('[data-boceto-block]')).toHaveLength(3);
  (host.querySelector('[data-boceto-block="intro"]') as HTMLElement).click();
  const field = host.querySelector('[data-boceto-field="headline"]') as HTMLInputElement;
  expect(field.value).toBe('Algo dulce');
  field.value = 'Nuevo título';
  field.dispatchEvent(new Event('input', { bubbles: true }));
  putSketch.mockImplementation(async (_s: any, body: any) => ({ revision: 4, sketch: { ...body.sketch, blocks: body.sketch.blocks.map((b: any) => (b.id === 'intro' ? { ...b, headline: 'REPARADO' } : b)) } } as any));
  await vi.advanceTimersByTimeAsync(500);
  expect(putSketch).toHaveBeenCalledTimes(1);
  expect(putSketch.mock.calls[0][1].sketch.blocks[0].headline).toBe('Nuevo título');
  await vi.waitFor(() => { if ((host.querySelector('[data-boceto-field="headline"]') as HTMLInputElement)?.value !== 'REPARADO') throw new Error('not re-rendered'); });
});

it('move, duplicate, delete and add compose the expected sketch', async () => {
  await mount();
  (host.querySelector('[data-boceto-block="cat"] [data-boceto-move-up]') as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(500);
  expect(putSketch.mock.calls[0][1].sketch.blocks.map((b: any) => b.id)).toEqual(['cat', 'intro', 'fin']);
  (host.querySelector('[data-boceto-add]') as HTMLSelectElement).value = 'marquee';
  (host.querySelector('[data-boceto-add-button]') as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(500);
  const added = putSketch.mock.calls[1][1].sketch.blocks;
  expect(added.some((b: any) => b.type === 'marquee')).toBe(true);
  expect(added.at(-1).type).toBe('footer');
});

it('renders merchant text through values, never markup', async () => {
  getSketch.mockResolvedValue({ revision: 3, sketch: { ...sketch(), blocks: [{ id: 'x', type: 'hero', variant: 'stacked', headline: '<img src=x onerror=alert(1)>', sub: '', cta: '', bg: 'paper', size: 'm' }] }, photos: [], fonts: ['anton'] } as any);
  await mount();
  expect(host.innerHTML).not.toContain('<img src=x');
});
