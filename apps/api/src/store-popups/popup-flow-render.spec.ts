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
  // Live 2026-11-18 (Miga v4): the back arrow floated mid-popup under an arch instead of a top corner.
  it('wants the back button in a top corner too', async () => {
    const back = '<div class="card"><button data-close aria-label="Cerrar">×</button><button data-back aria-label="Volver" class="b">←</button><h2>Hola amigos</h2><button data-next>Ok</button></div>';
    const lost = await measureFlow(base(`${SHEET}.card{position:relative;min-height:600px}.card [data-close]{position:absolute;top:8px;right:8px}.b{position:absolute;left:calc(50% - 22px);top:100px;width:44px;height:44px}`, { o: back, c: capture }, [flow[0], flow[2]]));
    expect(checkFlowRender(lost!).join(' ')).toMatch(/botón para volver va en una esquina/);
    const fine = await measureFlow(base(`${SHEET}.card{position:relative}.card [data-close]{position:absolute;top:8px;right:8px}.b{position:absolute;left:8px;top:8px;width:44px;height:44px}`, { o: back, c: capture }, [flow[0], flow[2]]));
    expect(checkFlowRender(fine!).join(' ')).not.toMatch(/volver/);
  });
  // Live 2026-11-19 (DooBoo, Antojo: three tries each): product tiles in a rail that scrolls sideways were measured past the screen,
  // so the popup «se sale a lo ancho», its close «not in a corner» and «not centred» — a scroller clips what it holds.
  it('measures a sideways-scrolling rail of tiles by what shows', async () => {
    const rail = '<div class="card"><button data-close aria-label="Cerrar">×</button><h2>Elige</h2><ul class="rail"><li data-tile><img data-slot="photo" alt=""><b data-slot="name"></b></li></ul></div>';
    const sheet = `${SHEET}.card{position:relative}.card [data-close]{position:absolute;top:8px;right:8px}.rail{display:flex;gap:12px;overflow-x:auto;padding:0;list-style:none}.rail [data-tile]{flex:0 0 340px}`;
    const measures = await measureFlow(base(sheet, { p: rail, c: capture }, [flow[1], flow[2]]));
    expect(checkFlowRender(measures!)).toEqual([]);
  });
  // Live 2026-11-18 (NOA v4): on a phone the dress cut-outs sat 148px past the edge, a 30px sliver left — the popup read flat.
  it('finds a cut-out pushed almost all the way off the screen', async () => {
    const art = '<div class="card"><button data-close aria-label="Cerrar">×</button><img data-art class="cala" src="/v1/uploads/a.png" alt=""><h2>Hola</h2><button data-next>Ok</button></div>';
    const sheet = `${SHEET}.card{position:relative;overflow:visible}.cala{position:absolute;left:-148px;bottom:0;width:178px;height:240px}@media(min-width:700px){.cala{left:-60px}}`;
    const hidden = await measureFlow(base(sheet, { o: art, c: capture }, [flow[0], flow[2]]));
    expect(checkFlowRender(hidden!)).toEqual(['paso o a 390px: el recorte «cala» queda casi todo fuera de la pantalla; muéstralo al menos a medias (puede cruzar el borde).']);
  });
  it('passes a sound full-page design at both sizes', async () => {
    const page = (inner: string) => `<div class="full" data-full><button data-close aria-label="Cerrar" class="x">×</button><div class="inner">${inner}</div></div>`;
    const sheet = '.full{position:relative;height:100%;background:#e8f4ff;color:#111;padding:24px;display:flex;align-items:center;justify-content:center;border:12px solid #e33}.inner{max-width:520px;text-align:center}.x{position:absolute;top:16px;right:16px;width:44px;height:44px}';
    const measures = await measureFlow(base(sheet, { o: page('<h2>Tienes un descuento sorpresa</h2><button data-next>Ver</button>'), c: page('<input data-field="whatsapp"><button data-submit>Enviar</button>') }, [flow[0], flow[2]]));
    expect(checkFlowRender(measures!)).toEqual([]);
    expect(measures!.every(m => m.contentRight - m.contentLeft >= m.size.width - 2)).toBe(true);
    // Live 2026-11-18 (goodProtein): a short full-page step must still fill the screen top to bottom.
    expect(measures!.every(m => m.contentBottom - m.contentTop >= m.size.height - 2)).toBe(true);
  });
});


import { chromium } from 'playwright';
import { readKitFileSync } from '@pagosya/storefront-kit';

describe('moment steps in the browser check (spec 2026-11-21 §5–6)', () => {
  const CARD = '.card{background:#fff;color:#111;padding:24px;width:min(420px,100%)}.card [data-close]{width:44px;height:44px}.card [data-tile] img{width:60px;height:60px}';
  const cartHtml = '<div class="card"><button data-close aria-label="Cerrar">×</button><h2>Tu carrito</h2><ul><li data-tile><img data-slot="photo" alt=""><b data-slot="name"></b><i data-slot="qty"></i></li></ul><p data-slot="total"></p><button data-next>Seguir</button></div>';
  const remindHtml = '<div class="card"><button data-close aria-label="Cerrar">×</button><p>Tu <b data-slot="percent"></b> sigue esperando: <b data-slot="code"></b></p><button data-apply>Usar mi código</button></div>';
  const captureHtml = '<div class="card"><button data-close aria-label="Cerrar">×</button><input data-field><button data-submit>Enviar</button></div>';
  const revealHtml = '<div class="card"><button data-close aria-label="Cerrar">×</button><b data-slot="code"></b><button data-next>Ir</button></div>';
  const rescueFlow = [{ id: 'k', kind: 'cart' }, { id: 'c', kind: 'capture' }, { id: 'r', kind: 'reveal' }, { id: 'm', kind: 'remind' }, { id: 'l', kind: 'land', to: 'checkout' }];
  const steps = { k: cartHtml, c: captureHtml, r: revealHtml, m: remindHtml };
  const cart = [{ id: 'p1', name: 'Habanero', price: 4500, quantity: 2, photo: '/v1/uploads/a.png' }, { id: 'p2', name: 'Serrano', price: 4000, quantity: 1, photo: '/v1/uploads/b.png' }];

  it('fills the cart tiles from the shopper\'s cart and shows a reminder with the code', async () => {
    const measures = await measureFlow({ ...base(CARD, steps, rescueFlow), context: { moment: 'rescue', cart } }, [{ width: 390, height: 844 }]);
    expect(measures!.map(m => m.stepId)).toEqual(['k', 'c', 'r', 'm']);
    expect(measures!.find(m => m.stepId === 'k')!.tiles).toBe(2);
    expect(checkFlowRender(measures!)).toEqual([]);
  });

  it('cart step with an empty cart: the check fails it', async () => {
    const measures = await measureFlow({ ...base(CARD, steps, rescueFlow), context: { moment: 'rescue', cart: [] } }, [{ width: 390, height: 844 }]);
    expect(checkFlowRender(measures!).join(' ')).toMatch(/paso k.*fichas/);
  });

  it('contact without a code: rescue skips capture, reveal and remind, and still opens on the cart', async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent('<!doctype html><body></body>');
      await page.addScriptTag({ content: readKitFileSync('retention.js') });
      const shown = await page.evaluate(([flow, html, lines]) => {
        (window as any).PAGOSYA_POPUP_PREVIEW({ signupEnabled: true, popupDesign: { id: 'cx', flow, steps: html, css: '', capture: 'whatsapp', percent: 10 } }, { slug: 'x', data: { items: [] } }, '', { moment: 'rescue', contact: true, code: '', cart: lines });
        return document.querySelector('[data-pya-popup]')?.getAttribute('data-step');
      }, [rescueFlow, steps, cart] as const);
      expect(shown).toBe('cart');
    } finally { await browser.close(); }
  });
});

describe('the reminder shows the percent of the code the shopper holds (final review I5)', () => {
  it('uses the context percent over the design percent', async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent('<!doctype html><body></body>');
      await page.addScriptTag({ content: readKitFileSync('retention.js') });
      const text = await page.evaluate(() => {
        const flow = [{ id: 'k', kind: 'cart' }, { id: 'm', kind: 'remind' }];
        const steps = { k: '<div><button data-close>x</button><ul><li data-tile><img data-slot="photo"><b data-slot="name"></b></li></ul></div>', m: '<div><button data-close>x</button><b data-slot="percent"></b><b data-slot="code"></b><button data-apply>Usar</button></div>' };
        (window as any).PAGOSYA_POPUP_PREVIEW({ signupEnabled: true, popupDesign: { id: 'cx', flow, steps, css: '', capture: 'whatsapp', percent: 15 } }, { slug: 'x', data: { items: [] } }, 'm', { moment: 'rescue', contact: true, code: 'POPAAA234', percent: 10, cart: [{ id: 'p1', name: 'A', price: 100, quantity: 1, photo: '' }] });
        return document.querySelector('[data-slot=percent]')?.textContent;
      });
      expect(text).toBe('10%');
    } finally { await browser.close(); }
  });
});
