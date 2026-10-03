// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bocetoRevealY, createBocetoPanel } from './source-boceto';
import { ApiError, MerchantStudioApi } from './api';

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

const lastLook = () => [...applied].reverse().find(payload => payload.vars || payload.blocks || payload.style);
const lastSelection = () => [...applied].reverse().find(payload => payload.selection)?.selection;

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
  expect(host.textContent).toContain('Toca dos veces');
});

it('a background change applies live to the preview and saves silently after the idle window', async () => {
  await mount();
  (host.querySelector('[data-boceto-block="intro"] .bct-block__head') as HTMLElement).click();
  const vivo = host.querySelector('.bct-props .bct-swatch[title="Vivo"]') as HTMLElement;
  vivo.click();
  expect(applied.length).toBeGreaterThan(0);
  const last = lastLook();
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

it('element drags from the canvas persist order and sticker position, defaults stay clean', async () => {
  const panel = await mount();
  (panel as any).remoteNodeMove('intro', 'copy/actions', ['actions', 'headline']);
  (panel as any).remoteElMove('intro', 'sticker', 140.26, -3);
  await vi.advanceTimersByTimeAsync(1300);
  const saved = putSketch.mock.calls.at(-1)[1].sketch.blocks.find((b: any) => b.id === 'intro');
  expect(saved.order).toEqual(['actions', 'headline', 'badge', 'sub', 'trust', 'note']);
  expect(saved.stickerPos).toEqual({ x: 100, y: 0 });
  (panel as any).remoteNodeMove('intro', 'copy/headline', ['badge', 'headline', 'sub', 'actions', 'trust', 'note']);
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)[1].sketch.blocks.find((b: any) => b.id === 'intro').order).toBeUndefined();
});

it('tint backgrounds resolve to derived pastels in the live apply and save as roles', async () => {
  await mount();
  (host.querySelector('[data-boceto-block="intro"] .bct-block__head') as HTMLElement).click();
  const pastel = host.querySelector('.bct-props .bct-swatch[title="Pastel acento"]') as HTMLElement;
  pastel.click();
  const last = lastLook();
  expect(last.blocks.intro.bg).toMatch(/^#[0-9a-f]{6}$/);
  expect(last.blocks.intro.bg).not.toBe('#f6ecd9');
  expect(last.vars['--skb-tint-1']).toBe(last.blocks.intro.bg);
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)[1].sketch.blocks[0].bg).toBe('tint-accent');
});

it('renders merchant text through textContent, never markup', async () => {
  getSketch.mockResolvedValue({ revision: 3, sketch: { ...sketch(), blocks: [{ id: 'x', type: 'hero', variant: 'stacked', headline: '<img src=x onerror=alert(1)>', sub: '', cta: '', badge: '', note: '', sticker: '', bg: 'paper', size: 'm' }] }, photos: [], fonts: ['anton'] } as any);
  await mount();
  expect(host.innerHTML).not.toContain('<img src=x');
});

it('page style controls apply live and save with the sketch', async () => {
  await mount();
  const square = [...host.querySelectorAll('.bct-segment__option')].find(b => b.textContent === 'Rectas') as HTMLElement;
  square.click();
  expect(lastLook().style.radius).toBe('square');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)[1].sketch.style.radius).toBe('square');
});

it('symmetry: alignment right and photo on the left apply live', async () => {
  const panel = await mount();
  (host.querySelector('[data-boceto-block="intro"] .bct-block__head') as HTMLElement).click();
  ([...host.querySelectorAll('.bct-props .bct-segment__option')].find(b => b.textContent === 'Izquierdo') as HTMLElement).click();
  panel.remoteSelect('intro', 'copy');
  ([...host.querySelectorAll('.bct-props .bct-segment__option')].find(b => b.textContent === 'Der.') as HTMLElement).click();
  expect(lastLook().blocks.intro).toMatchObject({ align: 'end', flip: true });
});

it('adding a review is structural: the preview reloads after the save', async () => {
  const reload = vi.fn();
  getSketch.mockResolvedValue({ revision: 3, sketch: { ...sketch(), blocks: [...sketch().blocks.slice(0, 2), { id: 'rev', type: 'reviews', title: 'Clientes', quotes: [{ text: 'Rico', name: 'Ana', place: '' }], photos: [], bg: 'paper', size: 'm' }, sketch().blocks[2]] }, photos: [], fonts: ['anton'] } as any);
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: version(), locked: false, saved: vi.fn().mockResolvedValue(undefined), apply: payload => applied.push(payload), reload });
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block="rev"]')) throw new Error('not ready'); });
  (host.querySelector('[data-boceto-block="rev"] .bct-block__head') as HTMLElement).click();
  ([...host.querySelectorAll('.bct-chip')].find(b => b.textContent === '+ Añadir reseña') as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)[1].sketch.blocks.find((b: any) => b.id === 'rev').quotes).toHaveLength(2);
  expect(reload).toHaveBeenCalledWith(4);
});

it('"Cambiar foto" from the canvas opens the picker and swaps the photo live as inline data', async () => {
  const withPhotos = { revision: 3, snapshot: { files: [{ path: 'sketch.json' }, { path: 'assets/a.jpg', content: 'AAAA', encoding: 'base64' }, { path: 'assets/b.jpg', content: 'BBBB', encoding: 'base64' }] } } as any;
  getSketch.mockResolvedValue({ revision: 3, sketch: sketch(), photos: ['assets/a.jpg', 'assets/b.jpg'], fonts: ['anton'] } as any);
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: withPhotos, locked: false, saved: vi.fn().mockResolvedValue(undefined), apply: payload => applied.push(payload) });
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  (panel as any).remotePhoto('intro', 'photo');
  const thumbs = host.querySelectorAll('.bct-thumbs--big .bct-thumb');
  expect(thumbs).toHaveLength(2);
  (thumbs[1] as HTMLElement).click();
  expect(lastLook().blocks.intro.photos).toEqual({ photo: 'data:image/jpeg;base64,BBBB' });
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)[1].sketch.blocks[0].photo).toBe('assets/b.jpg');
});

it('the icon picker searches the catalog and sets the step icon', async () => {
  const icons = vi.spyOn(MerchantStudioApi.prototype, 'sketchIcons').mockResolvedValue([{ name: 'gift', svg: '<svg viewBox="0 0 24 24"></svg>' }, { name: 'bad', svg: '<svg onload="x()"></svg>' }]);
  getSketch.mockResolvedValue({ revision: 3, sketch: { ...sketch(), blocks: [{ id: 'st', type: 'steps', title: 'Pasos', items: [{ icon: 'sparkles', title: 'Uno', text: '' }], bg: 'paper', size: 'm' }, sketch().blocks[2]] }, photos: [], fonts: ['anton'] } as any);
  await mount();
  (host.querySelector('[data-boceto-block="st"] .bct-block__head') as HTMLElement).click();
  ([...host.querySelectorAll('.bct-chip')].find(b => b.textContent?.includes('sparkles')) as HTMLElement).click();
  await vi.waitFor(() => { if (!host.querySelector('.bct-icon')) throw new Error('no icons'); });
  expect(host.querySelectorAll('.bct-icon')).toHaveLength(1);
  (host.querySelector('.bct-icon[title="gift"]') as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)[1].sketch.blocks[0].items[0].icon).toBe('gift');
  expect(icons).toHaveBeenCalled();
});

it('"Subir foto nueva" uploads, adds the photo to the store and drops it into the open slot', async () => {
  vi.useRealTimers();
  const images = await import('./source-images');
  vi.spyOn(images, 'prepareSourceImage').mockImplementation(async file => file);
  const upload = vi.spyOn(MerchantStudioApi.prototype, 'upload').mockResolvedValue({ url: '/v1/uploads/abc-1.jpg', assetId: 'a1' });
  const add = vi.spyOn(MerchantStudioApi.prototype, 'addSketchPhoto').mockResolvedValue({ revision: 5, path: 'assets/image-0123456789ab.jpg', photos: ['assets/a.jpg', 'assets/image-0123456789ab.jpg'] });
  const saved = vi.fn().mockResolvedValue(undefined);
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: version(), locked: false, saved, apply: payload => applied.push(payload) });
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  (panel as any).remotePhoto('intro', 'photo');
  const input = host.querySelector('.bct-section input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'nueva.jpg', { type: 'image/jpeg' })] });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => { if (!add.mock.calls.length) throw new Error('not added'); });
  expect(upload).toHaveBeenCalled();
  expect(add).toHaveBeenCalledWith('s1', { revision: 3, url: '/v1/uploads/abc-1.jpg' });
  expect(saved).toHaveBeenCalledWith(5);
  await vi.waitFor(() => { if (!lastLook()?.blocks?.intro?.photos) throw new Error('no live photo'); });
  expect(lastLook().blocks.intro.photos.photo).toMatch(/^data:image\/jpeg;base64,/);
  await vi.waitFor(() => { if (!putSketch.mock.calls.length) throw new Error('not saved'); }, { timeout: 3000 });
  expect(putSketch.mock.calls.at(-1)[1]).toMatchObject({ revision: 5 });
  expect(putSketch.mock.calls.at(-1)[1].sketch.blocks[0].photo).toBe('assets/image-0123456789ab.jpg');
});

it('the account page edits like a block: Capas entry, layout, perks, canvas text', async () => {
  getSketch.mockResolvedValue({ revision: 3, sketch: { ...sketch(), account: { id: 'account', type: 'account', layout: 'split', kicker: 'TU CUENTA', title: 'Hola', lead: 'l', perks: [{ icon: 'gift', text: 'Ofertas' }], bg: 'tint-accent' } }, photos: [], fonts: ['anton'] } as any);
  const panel = await mount();
  (host.querySelector('[data-boceto-block="account"] .bct-block__head') as HTMLElement).click();
  expect(host.textContent).toContain('Cuenta · ingreso y registro');
  expect(host.querySelector('.bct-remove')).toBeNull();
  ([...host.querySelectorAll('.bct-props .bct-segment__option')].find(b => b.textContent === 'Centrado') as HTMLElement).click();
  ([...host.querySelectorAll('.bct-chip')].find(b => b.textContent === '+ Añadir beneficio') as HTMLElement).click();
  (panel as any).remoteText('account', 'title', 'Bienvenido de vuelta');
  await vi.advanceTimersByTimeAsync(1300);
  const account = putSketch.mock.calls.at(-1)[1].sketch.account;
  expect(account).toMatchObject({ layout: 'center', title: 'Bienvenido de vuelta' });
  expect(account.perks).toHaveLength(2);
});

it('canvas selection paths are mirrored back to the preview with their label', async () => {
  const panel = await mount();
  panel.remoteSelect('intro', 'copy');
  expect(lastSelection()).toEqual({ id: 'intro', path: 'copy', label: 'Columna de texto' });
  panel.remoteSelect('intro', 'copy/missing');
  expect(lastSelection()).toMatchObject({ id: 'intro', path: 'copy' });
  panel.remoteSelect('nope', 'copy');
  expect(lastSelection()).toMatchObject({ id: '', path: '' });
});

it('a node move from the canvas updates order live; ⌥↓ moves the selected element and reloads', async () => {
  const reload = vi.fn();
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: version(), locked: false, saved: vi.fn().mockResolvedValue(undefined), apply: payload => applied.push(payload), reload });
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  panel.remoteNodeMove('intro', 'copy/headline', ['sub', 'headline', 'actions']);
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].order).toEqual(['sub', 'headline', 'actions', 'badge', 'trust', 'note']);
  expect(reload).not.toHaveBeenCalled();
  panel.remoteSelect('intro', 'copy/sub');
  panel.remoteKey('down');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].order).toEqual(['headline', 'sub', 'actions', 'badge', 'trust', 'note']);
  await vi.waitFor(() => expect(reload).toHaveBeenCalled());
});

it('Supr removes an optional element but never the headline; at block level it still deletes the block', async () => {
  const panel = await mount();
  panel.remoteSelect('intro', 'copy/sub');
  panel.remoteKey('delete');
  panel.remoteSelect('intro', 'copy/headline');
  panel.remoteKey('delete');
  await vi.advanceTimersByTimeAsync(1300);
  const saved = putSketch.mock.calls.at(-1)![1].sketch.blocks[0];
  expect([saved.sub, saved.headline]).toEqual(['', 'Algo dulce']);
  panel.remoteSelect('cat', '');
  panel.remoteKey('delete');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks.map((b: any) => b.id)).toEqual(['intro', 'fin']);
});

it('refuses hostile node moves', async () => {
  const panel = await mount();
  panel.remoteNodeMove('intro', 'copy/headline', Array.from({ length: 50 }, (_, i) => `k${i}`));
  panel.remoteNodeMove('intro', 'copy', ['media', 'copy']);
  await vi.advanceTimersByTimeAsync(1300);
  const saved = putSketch.mock.calls.at(-1)?.[1].sketch.blocks[0];
  expect(saved?.order).toBeUndefined();
  expect(saved?.flip).toBeUndefined();
});

it('a canvas edit on another block never keeps a part path from the previous block', async () => {
  const panel = await mount();
  panel.remoteSelect('intro', 'copy/sub');
  panel.remoteText('cat', 'title', 'Nuevos');
  expect(lastSelection()).toEqual({ id: 'cat', path: '', label: 'Catálogo' });
  panel.remoteKey('delete');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks.map((b: any) => b.id)).toEqual(['intro', 'fin']);
});

const clickSegment = (rowLabel: string, option: string) => {
  const row = [...host.querySelectorAll('.bct-row')].find(node => node.querySelector('.bct-row__label')?.textContent === rowLabel)!;
  ([...row.querySelectorAll('.bct-segment__option')].find(node => node.textContent === option) as HTMLElement).click();
};

it('a selected row group shows direction, spacing and alignment, applied live and saved as layout', async () => {
  getSketch.mockResolvedValueOnce({ revision: 3, sketch: { ...sketch(), blocks: [{ ...sketch().blocks[0], cta2: 'Caja' }, ...sketch().blocks.slice(1)] }, photos: [], fonts: [] } as any);
  const panel = await mount();
  panel.remoteSelect('intro', 'copy/actions');
  expect(host.querySelector('.bct-props .bct-section__title')?.textContent).toBe('Botones');
  clickSegment('Dirección', 'Vertical');
  clickSegment('Espacio', 'L');
  clickSegment('Alineación', 'Centro');
  const live = [...applied].reverse().find(payload => payload.blocks)!.blocks.intro.layout;
  expect(live).toEqual({ actions: { dir: 'column', gap: 'l', align: 'center' } });
  clickSegment('Espacio', 'Auto');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].layout).toEqual({ actions: { dir: 'column', align: 'center' } });
});

it('alignment lives on the copy column now; a leaf shows its name and a remove button when optional', async () => {
  const panel = await mount();
  panel.remoteSelect('intro', '');
  expect([...host.querySelectorAll('.bct-row__label')].map(node => node.textContent)).not.toContain('Alineación');
  panel.remoteSelect('intro', 'copy');
  clickSegment('Alineación', 'Centro');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].align).toBe('center');
  panel.remoteSelect('intro', 'copy/sub');
  expect(host.querySelector('.bct-props .bct-section__title')?.textContent).toBe('Bajada');
  (host.querySelector('[data-boceto-remove-node]') as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].sub).toBe('');
  panel.remoteSelect('intro', 'copy/headline');
  expect(host.querySelector('[data-boceto-remove-node]')).toBeNull();
});

it('the back button climbs one level at a time', async () => {
  const panel = await mount();
  panel.remoteSelect('intro', 'copy/sub');
  (host.querySelector('.bct-back') as HTMLElement).click();
  expect(lastSelection()).toMatchObject({ path: 'copy' });
  (host.querySelector('.bct-back') as HTMLElement).click();
  expect(lastSelection()).toMatchObject({ path: '' });
});

it('Capas is a tree: the arrow expands a block, a node row selects that path and highlights it', async () => {
  await mount();
  expect(host.querySelector('[data-boceto-block="intro"] .bct-tree')).toBeNull();
  (host.querySelector('[data-boceto-toggle="intro"]') as HTMLElement).click();
  const rows = [...host.querySelectorAll('[data-boceto-block="intro"] [data-boceto-node]')].map(node => node.getAttribute('data-boceto-node'));
  expect(rows).toEqual(['copy', 'copy/headline', 'copy/sub', 'copy/actions', 'copy/actions/cta']);
  (host.querySelector('[data-boceto-node="copy/actions"]') as HTMLElement).click();
  expect(lastSelection()).toMatchObject({ id: 'intro', path: 'copy/actions' });
  expect(host.querySelector('[data-boceto-node="copy/actions"]')?.classList.contains('is-selected')).toBe(true);
  (host.querySelector('[data-boceto-toggle="intro"]') as HTMLElement).click();
  expect(host.querySelector('[data-boceto-block="intro"] .bct-tree')).toBeNull();
});

it('selecting on the canvas expands that block in Capas', async () => {
  const panel = await mount();
  panel.remoteSelect('cat', 'head');
  expect(host.querySelector('[data-boceto-block="cat"] [data-boceto-node="head"]')?.classList.contains('is-selected')).toBe(true);
});

it('the live look lists every part of each block whose position saves, so the canvas lets you grab it directly', async () => {
  getSketch.mockResolvedValueOnce({ revision: 3, sketch: { ...sketch(), blocks: [{ ...sketch().blocks[0], kicker: 'NUEVO', cta2: 'Caja', photo: 'assets/a.jpg' }, { id: 'st', type: 'steps', title: 'Pasos', items: [{ icon: 'a', title: '1', text: '' }, { icon: 'b', title: '2', text: '' }], bg: 'paper', size: 'm' }, ...sketch().blocks.slice(1)] }, photos: ['assets/a.jpg'], fonts: [] } as any);
  const panel = await mount();
  panel.resync();
  const look = lastLook();
  expect(look.blocks.intro.movable).toEqual(['copy', 'copy/headline', 'copy/sub', 'copy/actions', 'copy/actions/cta', 'copy/actions/cta2', 'media']);
  expect(look.blocks.st.movable).toEqual(['items/0', 'items/1']);
  expect(look.blocks.cat.movable).toEqual([]);
});

it('choosing a part in Capas asks the canvas to reveal it; canvas clicks do not', async () => {
  const panel = await mount();
  panel.remoteSelect('intro', 'copy');
  expect(lastSelection().reveal).toBeUndefined();
  (host.querySelector('[data-boceto-node="copy/sub"]') as HTMLElement).click();
  expect(lastSelection()).toMatchObject({ path: 'copy/sub', reveal: true });
  panel.remoteSelect('intro', 'copy');
  expect(lastSelection().reveal).toBeUndefined();
});

it('follow-ups: after a conflict reload a stale part falls back to its nearest surviving parent, not the block', async () => {
  const panel = await mount();
  panel.remoteSelect('intro', 'copy/sub');
  putSketch.mockRejectedValueOnce(new ApiError('conflict', 409));
  getSketch.mockResolvedValueOnce({ revision: 5, sketch: { ...sketch(), blocks: [{ ...sketch().blocks[0], sub: '' }, ...sketch().blocks.slice(1)] }, photos: [], fonts: [] } as any);
  panel.remoteText('intro', 'headline', 'Otro');
  await vi.advanceTimersByTimeAsync(1300);
  await vi.waitFor(() => expect(host.textContent).toContain('se recargó'));
  expect(lastSelection()).toMatchObject({ id: 'intro', path: 'copy' });
  expect(host.querySelector('.bct-props .bct-section__title')?.textContent).toBe('Columna de texto');
});

it('follow-ups: a selected photo offers the photo picker, not the text hint', async () => {
  const withPhoto = { revision: 3, snapshot: { files: [{ path: 'sketch.json' }, { path: 'assets/a.jpg', content: 'AAAA', encoding: 'base64' }] } } as any;
  getSketch.mockResolvedValue({ revision: 3, sketch: { ...sketch(), blocks: [{ ...sketch().blocks[0], photo: 'assets/a.jpg' }, { id: 'gal', type: 'gallery', title: 'Galería', photos: ['assets/a.jpg'], bg: 'paper', size: 'm' }, sketch().blocks[2]] }, photos: ['assets/a.jpg'], fonts: [] } as any);
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: withPhoto, locked: false, saved: vi.fn().mockResolvedValue(undefined), apply: payload => applied.push(payload) });
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  for (const [id, path] of [['intro', 'media/photo'], ['gal', 'items/0']]) {
    panel.remoteSelect(id, path);
    const props = host.querySelector('.bct-props')!;
    expect(props.querySelector('.bct-photo-slot')).not.toBeNull();
    expect(props.textContent).not.toContain('Toca dos veces');
  }
  (host.querySelector('.bct-props .bct-photo-slot') as HTMLElement).click();
  expect(host.querySelector('.bct-thumbs--big')).not.toBeNull();
});

it('follow-ups: "Vertical" shows only when the copy column has a photo column beside it', async () => {
  getSketch.mockResolvedValueOnce({ revision: 3, sketch: { ...sketch(), blocks: [sketch().blocks[0], { ...sketch().blocks[0], id: 'pic', photo: 'assets/a.jpg' }, { id: 'nl', type: 'newsletter', variant: 'center', title: 'Club', note: '', cta: 'Ok', photo: 'assets/a.jpg', bg: 'deep', size: 'm' }, sketch().blocks[2]] }, photos: [], fonts: [] } as any);
  const panel = await mount();
  const labels = () => [...host.querySelectorAll('.bct-props .bct-row__label')].map(node => node.textContent);
  panel.remoteSelect('intro', 'copy');
  expect(labels()).not.toContain('Vertical');
  panel.remoteSelect('nl', 'copy');
  expect(labels()).not.toContain('Vertical');
  panel.remoteSelect('pic', 'copy');
  expect(labels()).toContain('Vertical');
});

it('each side panel tucks away behind its arrow against its wall and comes back from a tab', async () => {
  const resized = vi.fn();
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: version(), locked: true, saved: vi.fn().mockResolvedValue(undefined), apply: payload => applied.push(payload), resized });
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  const root = document.documentElement.style;
  expect([root.getPropertyValue('--bct-left'), root.getPropertyValue('--bct-right')]).toEqual(['240px', '300px']);
  const hide = host.querySelector('.bct-layers [data-boceto-dock="layers"]') as HTMLButtonElement;
  expect([hide.textContent, hide.disabled]).toEqual(['‹', false]);
  hide.click();
  expect(host.querySelector('.bct-layers')).toBeNull();
  expect(root.getPropertyValue('--bct-left')).toBe('0px');
  expect(resized).toHaveBeenCalledTimes(1);
  (host.querySelector('.bct-panel [data-boceto-dock="inspector"]') as HTMLElement).click();
  expect(host.querySelector('.bct-panel')).toBeNull();
  expect(root.getPropertyValue('--bct-right')).toBe('0px');
  const tabs = [...host.querySelectorAll('.bct-tab')].map(tab => tab.textContent);
  expect(tabs).toEqual(['›', '‹']);
  (host.querySelector('.bct-tab--left') as HTMLElement).click();
  expect(host.querySelector('.bct-layers')).not.toBeNull();
  expect(root.getPropertyValue('--bct-left')).toBe('240px');
});

it('a page built by an older renderer is re-saved once on open and the preview reloads with the editable page', async () => {
  const reload = vi.fn();
  getSketch.mockResolvedValueOnce({ revision: 3, sketch: sketch(), photos: [], fonts: [], stale: true } as any);
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: version(), locked: false, saved: vi.fn().mockResolvedValue(undefined), apply: payload => applied.push(payload), reload });
  await vi.waitFor(() => expect(putSketch).toHaveBeenCalledTimes(1));
  expect(putSketch.mock.calls[0][1]).toMatchObject({ revision: 3 });
  await vi.waitFor(() => expect(reload).toHaveBeenCalledWith(4));
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch).toHaveBeenCalledTimes(1);
});

it('a stale page in a locked studio is left alone', async () => {
  getSketch.mockResolvedValueOnce({ revision: 3, sketch: sketch(), photos: [], fonts: [], stale: true } as any);
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: version(), locked: true, saved: vi.fn().mockResolvedValue(undefined), apply: payload => applied.push(payload) });
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch).not.toHaveBeenCalled();
});

it('reveal pans the board only when the part is off screen, centring it', () => {
  // board 800px tall, zoom 0.5: a part at page y 400 (screen 40+200=240) is visible → stay.
  expect(bocetoRevealY(40, 0.5, 800, 400, 100)).toBe(40);
  // a part at page y 3000 (screen 1540) is below the board → centre it: 400 - (3000 + 50) * 0.5.
  expect(bocetoRevealY(40, 0.5, 800, 3000, 100)).toBe(400 - 3050 * 0.5);
  expect(bocetoRevealY(40, 0.5, 800, Number.NaN, 100)).toBe(40);
});

const mountWith = async (extra: Record<string, unknown>) => {
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: version(), locked: false, saved: vi.fn().mockResolvedValue(undefined), apply: payload => applied.push(payload), ...extra } as any);
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  return panel;
};

it('phase: the right panel offers Diseño | YAPI; YAPI docks the chat and tucking hides it', async () => {
  const yapi = vi.fn();
  await mountWith({ yapi });
  expect(host.querySelector('.bct-close')).toBeNull();
  (host.querySelector('[data-boceto-tab="yapi"]') as HTMLElement).click();
  expect(yapi).toHaveBeenLastCalledWith(true);
  expect(host.querySelector('.bct-panel.is-yapi .bct-props')).toBeNull();
  (host.querySelector('[data-boceto-dock="inspector"]') as HTMLElement).click();
  expect(yapi).toHaveBeenLastCalledWith(false);
  (host.querySelector('.bct-tab--right') as HTMLElement).click();
  expect(yapi).toHaveBeenLastCalledWith(true);
  (host.querySelector('[data-boceto-tab="design"]') as HTMLElement).click();
  expect(yapi).toHaveBeenLastCalledWith(false);
  expect(host.querySelector('.bct-panel .bct-section')).not.toBeNull();
});

it('phase: the selected block is reported once per change, as chat context', async () => {
  const selected = vi.fn();
  const panel = await mountWith({ selected });
  panel.remoteSelect('intro', 'copy/sub');
  panel.remoteSelect('intro', 'copy');
  panel.remoteSelect('cat', '');
  panel.remoteSelect('nope', '');
  expect(selected.mock.calls.map(call => call[0])).toEqual([{ id: 'intro', label: 'Portada' }, { id: 'cat', label: 'Catálogo' }, null]);
});

it('phase: flush() saves a pending edit right away', async () => {
  const panel = await mountWith({});
  (panel as any).remoteText('intro', 'headline', 'Último cambio');
  await (panel as any).flush();
  expect(putSketch.mock.calls.at(-1)[1].sketch.blocks[0].headline).toBe('Último cambio');
});

it('review: flush() reports a save that did not land, so Generar sitio can stop', async () => {
  const panel = await mountWith({});
  putSketch.mockRejectedValueOnce(new Error('network'));
  (panel as any).remoteText('intro', 'headline', 'Sin guardar');
  expect(await panel.flush()).toBe(false);
  expect(await panel.flush()).toBe(true);
  expect(putSketch.mock.calls.at(-1)[1].sketch.blocks[0].headline).toBe('Sin guardar');
});

it('review: while YAPI works the Boceto locks, says so, and ignores canvas edits', async () => {
  const panel = createBocetoPanel(new MerchantStudioApi());
  const options = { storeId: 's1', version: version(), locked: false, saved: vi.fn().mockResolvedValue(undefined), apply: (payload: any) => applied.push(payload) };
  panel.mount(host, options);
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  panel.mount(host, { ...options, locked: true });
  expect((host.querySelector('[data-boceto-move-up]') as HTMLButtonElement).disabled).toBe(true);
  expect(host.querySelector('.bct-status')?.textContent).toBe('YAPI está cambiando tu boceto…');
  expect(lastLook().blocks.intro.movable).toEqual([]);
  panel.remoteText('intro', 'headline', 'Durante el trabajo');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch).not.toHaveBeenCalled();
  panel.mount(host, options);
  expect((host.querySelector('[data-boceto-move-up]') as HTMLButtonElement).disabled).toBe(false);
});

it('review: when the Studio drops the chip, the same block brings it back only once picked again', async () => {
  const selected = vi.fn();
  const panel = await mountWith({ selected });
  panel.remoteSelect('intro', 'copy');
  panel.forgetSelection();
  panel.remoteText('intro', 'headline', 'Sigo editando');
  expect(selected.mock.calls.map(call => call[0])).toEqual([{ id: 'intro', label: 'Portada' }]);
  panel.remoteSelect('intro', 'copy');
  expect(selected.mock.calls.map(call => call[0])).toEqual([{ id: 'intro', label: 'Portada' }, { id: 'intro', label: 'Portada' }]);
});

it('free layer: a part pulled out on the canvas is saved with its spot, stops reordering and shows ↗ in Capas', async () => {
  const panel = await mount();
  panel.remoteFree('intro', 'copy/headline', 30, 40, 25);
  const look = lastLook().blocks.intro;
  expect(look.free).toEqual({ 'copy/headline': { x: 30, y: 40, w: 25 } });
  expect(look.freeable).toContain('copy/headline');
  expect(look.movable).not.toContain('copy/headline');
  expect(lastSelection()).toMatchObject({ id: 'intro', path: 'copy/headline' });
  expect([...host.querySelectorAll('.bct-node')].map(node => node.textContent)).toContain('↗ Título');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].free).toEqual({ 'copy/headline': { x: 30, y: 40, w: 25 } });
});

it('free layer: the canvas cannot free a whole column or the photo, and nothing while YAPI works', async () => {
  const panel = await mount();
  panel.remoteFree('intro', 'copy', 1, 1);
  panel.remoteFree('intro', 'media/photo', 1, 1);
  expect(lastLook()?.blocks?.intro?.free ?? {}).toEqual({});
  const locked = createBocetoPanel(new MerchantStudioApi());
  locked.mount(host, { storeId: 's1', version: version(), locked: true, saved: vi.fn(), apply: payload => applied.push(payload) });
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  locked.resync();
  expect(lastLook().blocks.intro.freeable).toEqual([]);
  locked.remoteFree('intro', 'copy/headline', 1, 1);
  expect(lastLook().blocks.intro.free).toEqual({});
});

it('free layer: Giro turns a free part live and "Volver a su lugar" puts it back', async () => {
  const panel = await mount();
  panel.remoteFree('intro', 'copy/sub', 10, 10);
  const turn = [...host.querySelectorAll('.bct-segment__option')].find(button => button.textContent === '8°') as HTMLElement;
  turn.click();
  expect(lastLook().blocks.intro.free['copy/sub']).toEqual({ x: 10, y: 10, r: 8 });
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].free).toEqual({ 'copy/sub': { x: 10, y: 10, r: 8 } });
  (host.querySelector('[data-boceto-unfree]') as HTMLElement).click();
  expect(lastLook().blocks.intro.free).toEqual({});
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].free).toBeUndefined();
});

it('free layer: removing an item from the inspector list keeps a freed item on the same item', async () => {
  getSketch.mockResolvedValueOnce({ revision: 3, sketch: { ...sketch(), blocks: [{ id: 'st', type: 'steps', title: 'T', note: '', kicker: '', items: [{ icon: 'a', title: 'Uno', text: '' }, { icon: 'b', title: 'Dos', text: '' }, { icon: 'c', title: 'Tres', text: '' }], free: { 'items/2': { x: 5, y: 5 } }, bg: 'paper', size: 'm' }, sketch().blocks[2]] }, photos: [], fonts: ['anton'] } as any);
  await mount();
  (host.querySelector('[data-boceto-block="st"] .bct-block__head') as HTMLElement).click();
  (host.querySelector('.bct-list__kill') as HTMLElement).click();
  expect(lastLook().blocks.st.free).toEqual({ 'items/1': { x: 5, y: 5 } });
});

const openBlock = (id: string) => {
  const head = host.querySelector(`[data-boceto-block="${id}"] .bct-block__head`) as HTMLElement;
  head.click();
  if (!host.querySelector('[data-boceto-insert]')) head.click();
};

it('insert: each kind lands centred, selected, and saves; the preview reloads to show it', async () => {
  const reload = vi.fn();
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: version(), locked: false, saved: vi.fn().mockResolvedValue(undefined), apply: payload => applied.push(payload), reload });
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  for (const kind of ['emoji', 'text', 'button', 'photo', 'icon']) {
    openBlock('intro');
    (host.querySelector(`[data-boceto-insert="${kind}"]`) as HTMLElement).click();
    expect(lastSelection().path).toMatch(/^extras\/e[a-z0-9]{3,10}$/);
  }
  await vi.advanceTimersByTimeAsync(1300);
  const extras = putSketch.mock.calls.at(-1)![1].sketch.blocks[0].extras;
  expect(extras.map((extra: any) => [extra.kind, extra.x, extra.y])).toEqual(['emoji', 'text', 'button', 'photo', 'icon'].map(kind => [kind, 45, 40]));
  expect(extras.find((extra: any) => extra.kind === 'photo').value).toBe('assets/a.jpg');
  expect(extras.find((extra: any) => extra.kind === 'button').href).toBe('checkout.html');
  await vi.waitFor(() => expect(reload).toHaveBeenCalled());
  expect([...host.querySelectorAll('.bct-node')].map(node => node.textContent)).toEqual(expect.arrayContaining(['Elementos sueltos', 'Emoji', 'Texto', 'Botón', 'Foto', 'Ícono']));
});

it('insert: the emoji grid, "Lleva a" WhatsApp and Eliminar edit the selected element', async () => {
  await mount();
  openBlock('intro');
  (host.querySelector('[data-boceto-insert="emoji"]') as HTMLElement).click();
  expect(host.querySelectorAll('[data-boceto-emoji]')).toHaveLength(40);
  (host.querySelector('[data-boceto-emoji="🍪"]') as HTMLElement).click();
  openBlock('intro');
  (host.querySelector('[data-boceto-insert="button"]') as HTMLElement).click();
  ([...host.querySelectorAll('.bct-segment__option')].find(button => button.textContent === 'WhatsApp') as HTMLElement).click();
  const phone = host.querySelector('[data-boceto-whatsapp]') as HTMLInputElement;
  phone.value = '+591 7000-0000'; phone.dispatchEvent(new Event('change'));
  await vi.advanceTimersByTimeAsync(1300);
  let extras = putSketch.mock.calls.at(-1)![1].sketch.blocks[0].extras;
  expect(extras.map((extra: any) => (extra.kind === 'emoji' ? extra.value : extra.href))).toEqual(['🍪', 'https://wa.me/59170000000']);
  (host.querySelector('[data-boceto-remove-node]') as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(1300);
  extras = putSketch.mock.calls.at(-1)![1].sketch.blocks[0].extras;
  expect(extras.map((extra: any) => extra.kind)).toEqual(['emoji']);
});

it('insert: a text element keeps up to 120 characters from a canvas edit; chips stop at 12', async () => {
  const panel = await mount();
  openBlock('intro');
  (host.querySelector('[data-boceto-insert="text"]') as HTMLElement).click();
  panel.remoteText('intro', 'extras.0.value', 'x'.repeat(150));
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].extras[0].value).toHaveLength(120);
  for (let i = 0; i < 11; i++) { openBlock('intro'); (host.querySelector('[data-boceto-insert="emoji"]') as HTMLElement).click(); }
  openBlock('intro');
  expect((host.querySelector('[data-boceto-insert="emoji"]') as HTMLButtonElement).disabled).toBe(true);
});

it('review: a canvas reorder beside a freed card keeps the moved card selected at its new index', async () => {
  getSketch.mockResolvedValueOnce({ revision: 3, sketch: { ...sketch(), blocks: [{ id: 'st', type: 'steps', title: 'T', note: '', kicker: '', items: [{ icon: 'a', title: 'Uno', text: '' }, { icon: 'b', title: 'Dos', text: '' }, { icon: 'c', title: 'Tres', text: '' }], free: { 'items/1': { x: 5, y: 5 } }, bg: 'paper', size: 'm' }, sketch().blocks[2]] }, photos: [], fonts: ['anton'] } as any);
  const panel = await mount();
  panel.remoteNodeMove('st', 'items/2', ['2', '0']);
  expect(lastSelection()).toMatchObject({ id: 'st', path: 'items/0' });
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].items.map((item: any) => item.title)).toEqual(['Tres', 'Dos', 'Uno']);
});

it('review: turning a gallery photo off keeps a freed photo on the same photo', async () => {
  getSketch.mockResolvedValueOnce({ revision: 3, sketch: { ...sketch(), blocks: [{ id: 'ga', type: 'gallery', kicker: '', title: 'G', photos: ['assets/a.jpg', 'assets/b.jpg', 'assets/c.jpg'], free: { 'items/2': { x: 5, y: 5 } }, bg: 'paper', size: 'm' }, sketch().blocks[2]] }, photos: ['assets/a.jpg', 'assets/b.jpg', 'assets/c.jpg'], fonts: ['anton'] } as any);
  await mount();
  (host.querySelector('[data-boceto-block="ga"] .bct-block__head') as HTMLElement).click();
  (host.querySelector('.bct-thumb.is-on') as HTMLElement).click();
  expect(lastLook().blocks.ga.free).toEqual({ 'items/1': { x: 5, y: 5 } });
});

it('review: a drop the boceto cannot keep (30 spots in the block) puts the part back on the canvas and says why', async () => {
  const full = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`copy/x${i}`, { x: i, y: i }]));
  getSketch.mockResolvedValueOnce({ revision: 3, sketch: { ...sketch(), blocks: [{ ...sketch().blocks[0], free: full }, ...sketch().blocks.slice(1)] }, photos: [], fonts: ['anton'] } as any);
  const panel = await mount();
  const before = applied.length;
  panel.remoteFree('intro', 'copy/headline', 30, 40);
  expect(applied.length).toBeGreaterThan(before);
  expect(lastLook().blocks.intro.free).toEqual(full);
  expect(host.querySelector('.bct-status')?.textContent).toContain('30 partes sueltas');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch).not.toHaveBeenCalled();
});

it('review: emptying an inserted text on the canvas keeps its words and points to Eliminar', async () => {
  const panel = await mount();
  openBlock('intro');
  (host.querySelector('[data-boceto-insert="text"]') as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(1300);
  const saves = putSketch.mock.calls.length;
  panel.remoteText('intro', 'extras.0.value', '   ');
  expect(host.querySelector('.bct-status')?.textContent).toContain('Eliminar');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.length).toBe(saves);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].extras[0].value).toBe('Escribe aquí');
});

const pressUndo = (shift = false) => document.dispatchEvent(new KeyboardEvent('keydown', { key: shift ? 'Z' : 'z', ctrlKey: true, shiftKey: shift, bubbles: true, cancelable: true }));

it('undo: Ctrl+Z puts a moved part back live, Ctrl+Shift+Z moves it again, and each saves', async () => {
  const reload = vi.fn();
  const panel = await mountWith({ reload });
  panel.remoteFree('intro', 'copy/headline', 30, 40);
  panel.remoteFree('intro', 'copy/headline', 50, 60);
  pressUndo();
  expect(lastLook().blocks.intro.free).toEqual({ 'copy/headline': { x: 30, y: 40 } });
  pressUndo();
  expect(lastLook().blocks.intro.free).toEqual({});
  pressUndo();
  expect(lastLook().blocks.intro.free).toEqual({});
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch).not.toHaveBeenCalled();
  pressUndo(true);
  expect(lastLook().blocks.intro.free).toEqual({ 'copy/headline': { x: 30, y: 40 } });
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].free).toEqual({ 'copy/headline': { x: 30, y: 40 } });
  expect(reload).not.toHaveBeenCalled();
});

it('undo: going back over a section reorder reloads the preview; a new edit clears the steps forward', async () => {
  const reload = vi.fn();
  const panel = await mountWith({ reload });
  panel.remoteReorder('cat', 0);
  await vi.advanceTimersByTimeAsync(1300);
  panel.remoteKey('undo');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks.map((block: any) => block.id)).toEqual(['intro', 'cat', 'fin']);
  await vi.waitFor(() => expect(reload).toHaveBeenCalled());
  panel.remoteText('intro', 'headline', 'Nuevo');
  panel.remoteKey('redo');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks.map((block: any) => block.id)).toEqual(['intro', 'cat', 'fin']);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].headline).toBe('Nuevo');
});

it('undo: a colour dragged in its picker goes back in one step; nothing while YAPI works', async () => {
  const panel = await mount();
  const color = host.querySelector('.bct-color') as HTMLInputElement;
  const start = color.value;
  for (const value of ['#111111', '#222222', '#333333']) { color.value = value; color.dispatchEvent(new Event('input')); }
  color.dispatchEvent(new Event('change'));
  panel.remoteKey('undo');
  expect(Object.values(lastLook().vars)).toContain(start);
  const locked = createBocetoPanel(new MerchantStudioApi());
  locked.mount(host, { storeId: 's1', version: version(), locked: true, saved: vi.fn(), apply: payload => applied.push(payload) });
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  const before = applied.length;
  locked.remoteKey('undo');
  expect(applied.length).toBe(before);
});
