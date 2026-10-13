import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { apiHeroUrls, fitStyleFrames, frameScale, heroSrcdoc, keepStylePolling, renderStylePicker, STYLE_POLL_MAX_MS, type StyleProposalView } from './source-style-pick';

const card = (index: number, mode: 'calm' | 'bold') => ({ index, slot: index, name: `Estilo ${index}`, mode, vibe: 'Vibra', inspiration: ['Uno', 'Dos', 'Tres'], fonts: { display: 'outfit', text: 'manrope', displayFamily: 'Outfit', textFamily: 'Manrope' }, palette: ['#ffffff', '#111111', '#ff0000', '#eeeeee'], html: '<header data-store-name>Buna</header>', source: 'model' as const });
const view: StyleProposalView = { generationId: 'g1', status: 'AWAITING_STYLE', recommended: 0, cards: [card(0, 'calm'), card(1, 'bold')] };
const state = { open: null, device: 'desktop' as const, storeName: 'Café Buna', busy: false };

describe('style picker', () => {
  // Spec 2026-10-12 faster generation: choosable once both cards are planned, while their heroes are still being drawn.
  it('lets the merchant choose a card whose hero is still being drawn, once both cards are planned', () => {
    const choosable: StyleProposalView = { ...view, status: 'RUNNING', pickable: true, cards: [{ ...card(0, 'calm'), source: 'template', pending: true }, card(1, 'bold')] };
    const grid = renderStylePicker(choosable, state);
    expect(grid).toContain('Elige tu estilo');
    expect(grid).not.toContain('Preparando tus estilos…');
    expect(grid).toContain('data-style-auto');
    expect(grid).not.toContain('data-style-placeholder');
    expect(grid).toContain('Mejorando diseño…');
    const preview = renderStylePicker(choosable, { ...state, open: 0 });
    expect(preview).toMatch(/data-style-use="0" >/);
    expect(preview).not.toContain('Podrás elegirlo cuando estén listos todos los estilos.');
    expect(renderStylePicker(choosable, { ...state, open: 0, busy: true })).toMatch(/data-style-use="0" disabled/);
  });
  it('keeps polling a running proposal for at most STYLE_POLL_MAX_MS, and never one that stopped running', () => {
    const running: StyleProposalView = { ...view, status: 'RUNNING' };
    expect(keepStylePolling(running, 0)).toBe(true);
    expect(keepStylePolling(running, STYLE_POLL_MAX_MS - 1)).toBe(true);
    expect(keepStylePolling(running, STYLE_POLL_MAX_MS)).toBe(false);
    expect(keepStylePolling(view, 0)).toBe(false);
    expect(keepStylePolling(null, 0)).toBe(false);
  });
  it('shows the two cards, one calm and one bold, with mode tags, font names, palette dots and an Elige tú button', () => {
    const html = renderStylePicker(view, state);
    expect(html.match(/data-style-card=/g)).toHaveLength(2);
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
    expect(html.match(/data-style-placeholder/g)).toHaveLength(1);
    expect(html).not.toContain('data-style-auto');
    // Two loading placeholders before any card arrives, not four.
    expect(renderStylePicker({ ...view, status: 'RUNNING', cards: [] }, state).match(/data-style-placeholder/g)).toHaveLength(2);
    expect(renderStylePicker(null, state).match(/data-style-placeholder/g)).toHaveLength(2);
  });
  it('shows a pending card with its template hero like any other, plus a small Mejorando diseño hint', () => {
    const html = renderStylePicker({ ...view, status: 'RUNNING', cards: [{ ...card(0, 'calm'), source: 'template', pending: true }] }, state);
    expect(html.match(/data-style-card=/g)).toHaveLength(1);
    expect(html).toMatch(/data-style-card="0" >/);
    expect(html).toContain('srcdoc=');
    expect(html.match(/Mejorando diseño…/g)).toHaveLength(1);
    expect(html).toContain('data-style-pending');
    expect(html.match(/data-style-placeholder/g)).toHaveLength(1);
    expect(renderStylePicker(view, state)).not.toContain('Mejorando diseño');
  });
  it('keeps Usar este estilo disabled in the preview while the proposal is still running', () => {
    const running = { ...view, status: 'RUNNING' as const };
    expect(renderStylePicker(running, { ...state, open: 1 })).toMatch(/data-style-use="1" disabled/);
    expect(renderStylePicker(view, { ...state, open: 1 })).not.toMatch(/data-style-use="1" disabled/);
  });
  it('says one calm and one bold in the header, and otherwise counts the cards actually shown', () => {
    expect(renderStylePicker(view, state)).toContain('Café Buna: uno tranquilo y uno atrevido.');
    const twoCalm = renderStylePicker({ ...view, cards: [card(0, 'calm'), card(1, 'calm')] }, state);
    expect(twoCalm).toContain('Café Buna: 2 estilos.');
    expect(twoCalm).not.toContain('uno tranquilo');
    // A proposal saved before the two-card change still shows its cards, counted.
    expect(renderStylePicker({ ...view, cards: [card(0, 'calm'), card(1, 'calm'), card(2, 'bold'), card(3, 'bold')] }, state)).toContain('Café Buna: 4 estilos.');
    expect(renderStylePicker({ ...view, status: 'RUNNING', cards: [card(1, 'bold')] }, state)).toContain('Café Buna: 1 estilo.');
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
    const html = renderStylePicker({ ...view, status: 'PICKED', picked: 1 }, state);
    expect(html.match(/data-style-card=/g)).toHaveLength(2);
    expect(html).toMatch(/class="style-card style-card--picked" data-style-card="1"/);
    expect(html.match(/style-card--picked/g)).toHaveLength(1);
    expect(html).toContain('data-style-retry="1"');
    expect(html).toContain('Reintentar con «Estilo 1»');
    expect(html).not.toContain('data-style-auto');
    expect(renderStylePicker({ ...view, status: 'PICKED', picked: 1 }, { ...state, busy: true })).toMatch(/data-style-retry="1" disabled/);
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
  it('renders the use button before the Vibe heading so the side panel never hides it', () => {
    const html = renderStylePicker(view, { ...state, open: 1 });
    expect(html.indexOf('data-style-use')).toBeGreaterThan(-1);
    expect(html.indexOf('data-style-use')).toBeLessThan(html.indexOf('>Vibe<'));
  });
  it('scrolls inside the canvas and keeps the side panel sticky', () => {
    const css = readFileSync(new URL('./source-style-pick.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.style-pick \{[^}]*overflow-y: ?auto/);
    expect(css).toMatch(/\.style-preview__side \{[^}]*position: ?sticky/);
    expect(css).toMatch(/\.style-pick footer \{[^}]*position: ?sticky/);
  });
  it('shows the commerce line in the preview side panel, escaped, and nothing when empty', () => {
    const open = { ...state, open: 0 };
    const withLine = (commerce: string): StyleProposalView => ({ ...view, cards: [{ ...card(0, 'calm'), commerce }, card(1, 'bold')] });
    expect(renderStylePicker(withLine('Cuenta: dividida · Pago: <b>ticket</b>'), open)).toContain('<p class="style-preview__commerce">Cuenta: dividida · Pago: &lt;b&gt;ticket&lt;/b&gt;</p>');
    expect(renderStylePicker(withLine(''), open)).not.toContain('style-preview__commerce');
  });
});

