jest.setTimeout(90_000);

import { chromium, type Browser } from 'playwright';
import { evaluateTemplateRules, type TemplateRuleFinding } from './source-template-qa-rules';

/** Spec 2026-11-16 store quality: the defects that reached saved designs (Bake Lab r2/r3, NOA r2), one page each. */
describe('template rules: store quality 2026-11-16', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
  afterAll(async () => { await browser.close(); });
  const picture = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#c96"/></svg>');
  const cutout = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="400"><circle cx="100" cy="200" r="100" fill="#642"/></svg>');
  const page = (body: string) => `<!doctype html><html><head><style>body{margin:0;font:16px/1.4 sans-serif;background:#fff;color:#111} section{padding:40px 16px;min-height:120px}</style></head>
    <body><main>${body}</main></body></html>`;
  const rules = async (width: 1280 | 390, body: string): Promise<TemplateRuleFinding[]> => {
    const tab = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    await tab.setContent(page(body));
    const found = await tab.evaluate(evaluateTemplateRules);
    await tab.close();
    return found;
  };
  const cover = `<section data-lb-at="0"><h1 style="font-size:80px">Tienda</h1><a href="#" style="display:inline-block;padding:12px 20px;background:#111;color:#fff">Comprar</a><img src="${picture}" width="600" height="400" alt=""></section>`;

  it('covered-text: a product cut-out over the middle of a big headline (Bake Lab r3 «RELLENAS HASTA EL CENTRO»)', async () => {
    const found = await rules(1280, `${cover}
      <section data-lb-at="1" style="position:relative;text-align:center">
        <h2 style="font-size:120px;margin:0;line-height:1">HASTA EL CENTRO</h2>
        <img src="${cutout}" alt="" style="position:absolute;left:50%;top:0;width:220px;height:240px;transform:translateX(-50%)">
      </section>`);
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'covered-text', part: 1 })]));
  });

  const tile = (inner: string, paint = 'background:#6b7a4a') => `<div style="height:220px;${paint}">${inner}</div>`;
  it('photo-less-tile: painted tiles without a photo beside tiles with one (Bake Lab r3 «Combos», «Cajas»)', async () => {
    const found = await rules(1280, `${cover}
      <section data-lb-at="1"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        ${tile(`<img src="${picture}" style="width:100%;height:100%;object-fit:cover" alt=""><b>Galletas</b>`)}
        ${tile(`<img src="${picture}" style="width:100%;height:100%;object-fit:cover" alt=""><b>Pastelería</b>`)}
        ${tile('<b>Combos</b>')}${tile('<b>Cajas</b>')}
      </div></section>`);
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'photo-less-tile', part: 1, severity: 'advice' })]));
  });
  it('photo-less-tile: not for a row where no tile has a photo, nor for product cards', async () => {
    const found = await rules(1280, `${cover}
      <section data-lb-at="1"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${tile('<b>Uno</b>')}${tile('<b>Dos</b>')}${tile('<b>Tres</b>')}</div></section>
      <section data-lb-at="2"><div data-pagosya-catalog style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        <article class="menu-item" style="height:240px"><img src="${picture}" style="width:100%" alt=""></article>
        <article class="menu-item" style="height:240px;background:#eee">Sin foto</article>
        <article class="menu-item" style="height:240px"><img src="${picture}" style="width:100%" alt=""></article>
      </div></section>`);
    expect(found.find(f => f.rule === 'photo-less-tile')).toBeUndefined();
  });

  it('hero-actions: the cover\'s calls to action are words with a line under them (NOA r2 «Ver novias | Reservar cita»)', async () => {
    const found = await rules(1280, `<section data-lb-at="0"><h1 style="font-size:80px">NOA VARGAS</h1>
        <a href="#" style="font-size:12px;letter-spacing:.1em;text-decoration:none;border-bottom:1px solid #111">VER NOVIAS</a>
        <a href="#" style="font-size:12px;letter-spacing:.1em;text-decoration:none">RESERVAR CITA</a>
        <img src="${picture}" width="600" height="400" alt=""></section>`);
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'hero-actions', part: 0 })]));
  });
  it('hero-actions: a real button with one secondary text link passes', async () => {
    const found = await rules(1280, `<section data-lb-at="0"><h1 style="font-size:80px">Tienda</h1>
        <a href="#" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:999px">Comprar</a>
        <a href="#">Ver cómo se hace</a><img src="${picture}" width="600" height="400" alt=""></section>`);
    expect(found.find(f => f.rule === 'hero-actions')).toBeUndefined();
  });

  const stepTile = (n: string, title: string) => `<div style="height:420px;display:flex;flex-direction:column;justify-content:space-between;background:#8a2533;color:#fff;padding:24px"><b style="font-size:64px">${n}</b><span style="font-size:24px">${title}</span></div>`;
  it('hollow-tiles: tall tiles with the number on top, the title at the bottom and nothing between (NOA r2)', async () => {
    const found = await rules(1280, `${cover}
      <section data-lb-at="1"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0">${stepTile('01', 'Conversación')}${stepTile('02', 'Construcción')}${stepTile('03', 'Pruebas')}</div></section>`);
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'hollow-tiles', part: 1 })]));
  });
  it('hollow-tiles: photo tiles and short tiles pass', async () => {
    const found = await rules(1280, `${cover}
      <section data-lb-at="1"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        ${[1, 2, 3].map(() => `<div style="height:420px;position:relative"><img src="${picture}" style="width:100%;height:100%;object-fit:cover" alt=""><b style="position:absolute;bottom:12px;left:12px">Uno</b></div>`).join('')}
      </div></section>
      <section data-lb-at="2"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${[1, 2, 3].map(n => `<div style="height:160px;background:#eee;padding:16px"><b>${n}</b><p>Texto corto</p></div>`).join('')}</div></section>`);
    expect(found.find(f => f.rule === 'hollow-tiles')).toBeUndefined();
  });
});
