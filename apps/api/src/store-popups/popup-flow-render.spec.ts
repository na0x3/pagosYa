import { checkFlowRender, measureFlow } from './popup-flow-render';

/** Popups 2.0 part 1 (spec 2026-11-18 §6): every step of a YAPI design in a real browser, at phone and desktop width. */
jest.setTimeout(120_000);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const base = (css: string, steps: Record<string, string>, flow: unknown[]) => ({
  storeName: 'Calima',
  design: { id: 'cdesign000000000000000001', flow, steps, css, capture: 'whatsapp', percent: 15 },
  items: [{ id: 'p1', name: 'Habanero', price: 4500, imageUrls: ['/v1/uploads/a.png'] }, { id: 'p2', name: 'Serrano', price: 4000, imageUrls: ['/v1/uploads/b.png'] }],
  photos: { '/v1/uploads/a.png': { bytes: PNG, contentType: 'image/png' }, '/v1/uploads/b.png': { bytes: PNG, contentType: 'image/png' } },
});
const SHEET = '.card{background:#fff;color:#111;padding:24px;width:min(420px,100%);border-radius:16px}.card [data-close]{width:44px;height:44px}.card [data-tile] img{width:80px;height:80px}';
const offer = '<div class="card"><button data-close aria-label="Cerrar">×</button><h2>15% para ti</h2><button data-next>Quiero</button></div>';
const capture = '<div class="card"><button data-close aria-label="Cerrar">×</button><input data-field="whatsapp"><button data-submit>Enviar</button></div>';
const pick = '<div class="card"><button data-close aria-label="Cerrar">×</button><ul><li data-tile><img data-slot="photo" alt=""><b data-slot="name"></b></li></ul></div>';
const flow = [{ id: 'o', kind: 'offer' }, { id: 'p', kind: 'pick', products: ['p1', 'p2'] }, { id: 'c', kind: 'capture' }];

describe('popup design render check', () => {
  it('passes a sound design and measures every step at both sizes', async () => {
    const measures = await measureFlow(base(SHEET, { o: offer, p: pick, c: capture }, flow));
    expect(measures).not.toBeNull();
    expect(measures!.map(m => `${m.stepId}@${m.size.width}`)).toEqual(['o@1280', 'p@1280', 'c@1280', 'o@390', 'p@390', 'c@390']);
    expect(measures!.find(m => m.stepId === 'p')!.tiles).toBe(2);
    expect(measures!.find(m => m.stepId === 'c')!.fieldsTypeable).toBe(true);
    expect(measures!.every(m => m.screenshot.length > 1000)).toBe(true);
    expect(checkFlowRender(measures!)).toEqual([]);
  });

  it('finds a close button hidden through its parent, a box that overflows a phone, and unreadable text', async () => {
    const sheet = `${SHEET}.wrap{display:none}`;
    const closeGone = await measureFlow(base(sheet, { o: '<div class="card"><span class="wrap"><button data-close>×</button></span><h2>Hola</h2><button data-next>Ok</button></div>', c: capture }, [flow[0], flow[2]]));
    expect(checkFlowRender(closeGone!).join(' ')).toMatch(/cerrar/);
    const wide = await measureFlow(base(`${SHEET}.card{width:900px}`, { o: offer, c: capture }, [flow[0], flow[2]]));
    expect(checkFlowRender(wide!).join(' ')).toMatch(/se sale.*390|390.*se sale/);
    const faint = await measureFlow(base(`${SHEET}.card h2{color:#eee}`, { o: offer, c: capture }, [flow[0], flow[2]]));
    expect(checkFlowRender(faint!).join(' ')).toMatch(/contraste/);
  });
  // Final review (I6): a close faded out through its parent (opacity is not inherited) is still hidden.
  it('finds a close button faded out by a parent', async () => {
    const faded = await measureFlow(base(`${SHEET}.top{opacity:0}`, { o: '<div class="card"><div class="top"><button data-close aria-label="Cerrar">×</button></div><h2>Hola</h2><button data-next>Ok</button></div>', c: capture }, [flow[0], flow[2]]));
    expect(checkFlowRender(faded!).join(' ')).toMatch(/paso o a 390px: no se ve/);
  });
  // Live 2026-11-18 (Remolino): the popup sat at the left on desktop and quiz answers were squeezed one syllable per line.
  it('keeps a sound design centred at both sizes', async () => {
    const measures = await measureFlow(base(SHEET, { o: offer, c: capture }, [flow[0], flow[2]]));
    for (const m of measures!) expect(Math.abs((m.contentLeft + m.contentRight) / 2 - m.size.width / 2)).toBeLessThan(40);
  });
  it('finds text squeezed into a sliver', async () => {
    const squeezed = await measureFlow(base(`${SHEET}.card h2{width:14px}`, { o: offer, c: capture }, [flow[0], flow[2]]));
    expect(checkFlowRender(squeezed!).join(' ')).toMatch(/aplastado/);
  });
  // Owner 2026-11-18 («look at their pop up its amazing», Fishwife/Alia): product art may burst past the edges; text may not.
  it('lets decoration marked data-art cross the edges, never text', async () => {
    const art = '<div class="card"><button data-close aria-label="Cerrar">×</button><img data-art class="burst" src="/v1/uploads/a.png" alt=""><h2>Hola</h2><button data-next>Ok</button></div>';
    const sheet = `${SHEET}.card{position:relative;overflow:visible}.burst{position:absolute;left:-260px;bottom:-140px;width:420px;height:120px}`;
    const ok = await measureFlow(base(sheet, { o: art, c: capture }, [flow[0], flow[2]]));
    expect(checkFlowRender(ok!)).toEqual([]);
    const words = await measureFlow(base(`${sheet}.card h2{position:absolute;left:-300px;white-space:nowrap}`, { o: art, c: capture }, [flow[0], flow[2]]));
    expect(checkFlowRender(words!).join(' ')).toMatch(/se sale/);
  });
  // Live 2026-11-18 (Remolino): the WhatsApp box sat on top of its «+591» prefix.
  it('finds words hidden under another part of the popup', async () => {
    const covered = '<div class="card"><button data-close aria-label="Cerrar">×</button><label class="row"><span class="pre">+591</span><input data-field="whatsapp"></label><button data-submit>Enviar</button></div>';
    const measures = await measureFlow(base(`${SHEET}.row{position:relative;display:block}.pre{position:absolute;left:8px;top:8px}.row input{position:relative;width:100%;height:44px;background:#fff}`, { o: offer, c: covered }, [flow[0], flow[2]]));
    expect(checkFlowRender(measures!).join(' ')).toMatch(/tapado/);
  });
  // Live 2026-11-18 (Fishwife v3): the close floated mid-left over the art, and the headline ran over a tin.
  it('wants the close in a top corner and no words over the cut-outs', async () => {
    const mid = '<div class="card"><button data-close aria-label="Cerrar" class="mid">×</button><h2>Hola amigos</h2><button data-next>Ok</button></div>';
    const lost = await measureFlow(base(`${SHEET}.card{position:relative;min-height:400px}.mid{position:absolute;left:8px;top:180px}`, { o: mid, c: capture }, [flow[0], flow[2]]));
    expect(checkFlowRender(lost!).join(' ')).toMatch(/esquina/);
    const over = '<div class="card"><button data-close aria-label="Cerrar">×</button><img data-art class="tin" src="/v1/uploads/a.png" alt=""><h2>Hola amigos</h2><button data-next>Ok</button></div>';
    const under = await measureFlow(base(`${SHEET}.card{position:relative}.tin{position:absolute;left:0;top:40px;width:100%;height:120px}`, { o: over, c: capture }, [flow[0], flow[2]]));
    expect(checkFlowRender(under!).join(' ')).toMatch(/encima de un recorte/);
  });
  // Live 2026-11-18 (Miga, goodProtein): words on a solid card or button above the art are fine; only bare words over art are not.
  it('accepts words on a solid surface above a cut-out', async () => {
    const card = '<div class="card"><button data-close aria-label="Cerrar">×</button><img data-art class="tin" src="/v1/uploads/a.png" alt=""><div class="panel"><h2>Hola amigos</h2><button data-next>Ok</button></div></div>';
    const fine = await measureFlow(base(`${SHEET}.card{position:relative}.tin{position:absolute;left:0;top:40px;width:100%;height:160px;z-index:0}.panel{position:relative;z-index:1;background:#fff}`, { o: card, c: capture }, [flow[0], flow[2]]));
    expect(checkFlowRender(fine!).join(' ')).not.toMatch(/encima de un recorte/);
  });
});

