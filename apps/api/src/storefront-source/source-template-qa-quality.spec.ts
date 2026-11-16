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
});
