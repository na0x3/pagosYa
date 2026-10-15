import { assumedFactsBlockMessage, assumedFactsCheckRow, assumedFactsView, assumedRemovalInstruction, cleanFactText, replaceAssumedText, withAssumedEdit, withAssumedStatus } from './assumed-facts';
import { readVoice, voiceFile, type StoreVoice } from './store-voice';

const SHEET: StoreVoice = { version: 1, voice: 'Hablamos de tú.', specifics: [], texture: [], assumed: [{ id: 'a1', text: 'desde 1998', kind: 'history', status: 'assumed' }, { id: 'a2', text: 'tostado en Caranavi', kind: 'origin', status: 'assumed' }], words: {}, avoid: [] };
/** A home where «desde 1998» is marked once, stated once without the mark, and named in an attribute, a script and a comment. */
const HOME = `<!doctype html><html><body><header data-pagosya-header><img alt="desde 1998" src="logo.png"></header><main><p>Tostamos <span class="hecho" data-assumed="a1">desde <b>1998</b></span> cada semana.</p><p title='<span data-assumed="a1">x</span>'>Café de altura.</p><p>Servimos café desde 1998.</p><script>const s = '<span data-assumed="a1">desde 1998</span>';</script><!-- <span data-assumed="a1">viejo</span> --><p><span data-assumed="a2">tostado en Caranavi</span></p></main></body></html>`;
const CARTA = '<main><p>Abiertos <span data-assumed="a1">desde 1998</span>.</p></main>';
const files = () => [{ path: 'index.html', content: HOME }, { path: 'pages/carta.html', content: CARTA }, { path: 'nosotros.html', content: '<main><div data-pagosya-page="about"></div></main>' }, voiceFile(SHEET)];

describe('«Datos que YAPI supuso» (spec 2026-10-14, part 5)', () => {
  it('lists where each fact appears, wrapped and unwrapped', () => {
    expect(assumedFactsView(files())).toEqual([
      { id: 'a1', text: 'desde 1998', kind: 'history', status: 'assumed', pages: ['index.html', 'pages/carta.html'], unwrapped: ['index.html'] },
      { id: 'a2', text: 'tostado en Caranavi', kind: 'origin', status: 'assumed', pages: ['index.html'], unwrapped: [] },
    ]);
    expect(assumedFactsView([{ path: 'index.html', content: HOME }])).toEqual([]);
  });

  it('edits every wrapped copy, never attributes or text outside the spans', () => {
    const { html, count } = replaceAssumedText(HOME, 'a1', 'desde 2003 & <siempre>');
    expect(count).toBe(1);
    expect(html).toContain('Tostamos <span class="hecho" data-assumed="a1">desde 2003 &amp; &lt;siempre&gt;</span> cada semana.');
    expect(html).toContain('alt="desde 1998"');
    expect(html).toContain(`title='<span data-assumed="a1">x</span>'`);
    expect(html).toContain('Servimos café desde 1998.');
    expect(html).toContain(`const s = '<span data-assumed="a1">desde 1998</span>';`);
    expect(html).toContain('<!-- <span data-assumed="a1">viejo</span> -->');
    expect(html).toContain('<span data-assumed="a2">tostado en Caranavi</span>');
    const edited = withAssumedEdit(files(), 'a1', 'desde 2003')!;
    expect(edited.replaced).toBe(2);
    expect(readVoice(edited.files)!.assumed[0]).toEqual({ id: 'a1', text: 'desde 2003', kind: 'history', status: 'confirmed' });
    expect(edited.files.find(file => file.path === 'pages/carta.html')!.content).toBe('<main><p>Abiertos <span data-assumed="a1">desde 2003</span>.</p></main>');
    expect(withAssumedEdit(files(), 'a9', 'x')).toBeUndefined();
  });

  it('confirms a fact without touching any page', () => {
    const confirmed = withAssumedStatus(files(), 'a2', 'confirmed')!;
    expect(readVoice(confirmed)!.assumed.map(fact => fact.status)).toEqual(['assumed', 'confirmed']);
    expect(confirmed.find(file => file.path === 'index.html')!.content).toBe(HOME);
    expect(withAssumedStatus(files(), 'a9', 'confirmed')).toBeUndefined();
  });

  it.each([['  desde   2003 ', 'desde 2003'], ['<b>2003</b>', undefined], ['x'.repeat(161), undefined], ['', undefined], [7, undefined]])('cleans the merchant’s text %p', (raw, expected) => {
    expect(cleanFactText(raw)).toBe(expected);
  });

  it('asks YAPI to remove a fact on the pages that mark it, naming them so the edit reads them', () => {
    const text = assumedRemovalInstruction({ id: 'a1', text: 'desde 1998', pages: ['index.html', 'pages/carta.html'] });
    for (const part of ['«desde 1998»', '<span data-assumed="a1">', 'index.html, pages/carta.html', 'sin inventar otro', 'No cambies nada más']) expect({ part, found: text.includes(part) }).toEqual({ part, found: true });
  });

  it('blocks publishing with the facts listed', () => {
    expect(assumedFactsBlockMessage([{ text: 'desde 1998' }, { text: 'tostado en Caranavi' }])).toBe('Antes de publicar, confirma, corrige o quita los 2 datos que YAPI supuso: «desde 1998», «tostado en Caranavi». Están en «Datos que YAPI supuso».');
    expect(assumedFactsCheckRow([{ text: 'desde 1998' }])).toEqual({ label: 'Datos que YAPI supuso', status: 'failed', blocking: true, detail: 'Antes de publicar, confirma, corrige o quita el dato que YAPI supuso: «desde 1998». Está en «Datos que YAPI supuso».' });
  });
});
