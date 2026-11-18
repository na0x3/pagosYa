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
});
