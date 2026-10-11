import { describe, expect, it } from 'vitest';
import { apiHeroUrls, fitStyleFrames, frameScale, heroSrcdoc, renderStylePicker, type StyleProposalView } from './source-style-pick';

const card = (index: number, mode: 'calm' | 'bold') => ({ index, slot: index, name: `Estilo ${index}`, mode, vibe: 'Vibra', inspiration: ['Uno', 'Dos', 'Tres'], fonts: { display: 'outfit', text: 'manrope', displayFamily: 'Outfit', textFamily: 'Manrope' }, palette: ['#ffffff', '#111111', '#ff0000', '#eeeeee'], html: '<header data-store-name>Buna</header>', source: 'model' as const });
const view: StyleProposalView = { generationId: 'g1', status: 'AWAITING_STYLE', recommended: 2, cards: [card(0, 'calm'), card(1, 'calm'), card(2, 'bold'), card(3, 'bold')] };
const state = { open: null, device: 'desktop' as const, storeName: 'Café Buna', busy: false };

describe('style picker', () => {
  it('shows four cards with mode tags, font names, palette dots and an Elige tú button', () => {
    const html = renderStylePicker(view, state);
    expect(html.match(/data-style-card=/g)).toHaveLength(4);
    expect(html).toContain('Tranquilo');
    expect(html).toContain('Atrevido');
    expect(html).toContain('Outfit · Manrope');
    expect(html).toContain('background:#ff0000');
    expect(html).toContain('data-style-auto');
    expect(html).toContain('Elige tú');
  });
  it('renders heroes only in a script-less sandbox', () => {
    const html = renderStylePicker(view, state);
    expect(html).toContain('sandbox=""');
    expect(html).not.toContain('allow-scripts');
  });
  it('shows empty cards and no Elige tú while the proposal is still running', () => {
    const html = renderStylePicker({ ...view, status: 'RUNNING', cards: [{ ...card(0, 'calm'), html: null, source: null }] }, state);
    expect(html).toContain('Preparando tus estilos…');
    expect(html.match(/data-style-placeholder/g)).toHaveLength(3);
    expect(html).not.toContain('data-style-auto');
  });
  it('opens a preview with vibe, inspiration, typography and the use button', () => {
    const html = renderStylePicker(view, { ...state, open: 1 });
    expect(html).toContain('Vibe');
    expect(html).toContain('Inspiración');
    expect(html).toContain('Tipografía');
    expect(html).toContain('data-style-use="1"');
    expect(html).toContain('Usar este estilo');
  });
  it('escapes card text and drops colours that are not hex', () => {
    const html = renderStylePicker({ ...view, cards: [{ ...card(0, 'calm'), name: '<img src=x>', palette: ['red;background:url(x)'] }] }, state);
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('url(x)');
  });
  it('after a failed pick build, marks the picked card and offers Reintentar with it instead of Elige tú', () => {
    const html = renderStylePicker({ ...view, status: 'PICKED', picked: 3 }, state);
    expect(html.match(/data-style-card=/g)).toHaveLength(4);
    expect(html).toMatch(/class="style-card style-card--picked" data-style-card="3"/);
    expect(html.match(/style-card--picked/g)).toHaveLength(1);
    expect(html).toContain('data-style-retry="3"');
    expect(html).toContain('Reintentar con «Estilo 3»');
    expect(html).not.toContain('data-style-auto');
    expect(renderStylePicker({ ...view, status: 'PICKED', picked: 3 }, { ...state, busy: true })).toMatch(/data-style-retry="3" disabled/);
  });
  it('wraps a hero in a full document and escapes it for srcdoc', () => {
    const doc = heroSrcdoc('<p class="a">"x" & y</p>');
    expect(doc).toContain('&lt;!doctype html&gt;');
    expect(doc).toContain('&quot;x&quot; &amp; y');
  });
});

describe('hero API urls', () => {
  const base = 'http://localhost:4312/api/v1';
  it('points uploads and fonts at the Studio API base', () => {
    const html = `<img src="/v1/uploads/a.jpg"><style>@font-face{src:url(/v1/source-fonts/outfit.ttf)}.h{background:url('/v1/uploads/b.webp')}</style><img srcset="/v1/uploads/c.jpg 1x, /v1/uploads/d.jpg 2x">`;
    expect(apiHeroUrls(html, base)).toBe(`<img src="${base}/uploads/a.jpg"><style>@font-face{src:url(${base}/source-fonts/outfit.ttf)}.h{background:url('${base}/uploads/b.webp')}</style><img srcset="${base}/uploads/c.jpg 1x, ${base}/uploads/d.jpg 2x">`);
  });
  it('drops a trailing slash on the base and accepts /api/v1 paths', () => {
    expect(apiHeroUrls('<img src="/api/v1/uploads/a.jpg">', '/api/v1/')).toBe('<img src="/api/v1/uploads/a.jpg">');
  });
  it('leaves absolute URLs and text mentioning v1 alone', () => {
    const html = '<img src="https://cdn.test/v1/uploads/a.jpg"><p>v1/uploads/ es texto</p><a href="/v1/stores/x">x</a>';
    expect(apiHeroUrls(html, base)).toBe(html);
  });
});

describe('frame fit', () => {
  it('shrinks a page to fit the box whole, by the tighter side, and never enlarges it', () => {
    expect(frameScale(640, 400, 1280, 800)).toBe(0.5);
    expect(frameScale(640, 1000, 1280, 800)).toBe(0.5);
    expect(frameScale(800, 422, 390, 844)).toBe(0.5);
    expect(frameScale(4000, 4000, 1280, 800)).toBe(1);
    expect(frameScale(0, 0, 390, 844)).toBe(0);
  });
  it('sets --frame-scale on each sized frame from its box', () => {
    const set: Array<[string, string]> = [];
    const frame = { clientWidth: 800, clientHeight: 422, dataset: { frameWidth: '390', frameHeight: '844' }, style: { setProperty: (name: string, value: string) => set.push([name, value]) } };
    fitStyleFrames({ querySelectorAll: () => [frame] } as unknown as ParentNode);
    expect(set).toEqual([['--frame-scale', '0.5']]);
  });
  it('gives the phone preview a full phone page and the cards a desktop page', () => {
    expect(renderStylePicker(view, { ...state, open: 1, device: 'phone' })).toContain('style="width:390px;height:844px"');
    expect(renderStylePicker(view, state)).toContain('style="width:1280px;height:800px"');
  });
});
