jest.setTimeout(120_000);
import { checkProductThemeOnSnapshot } from './product-theme-check';
import { kitDefaultSnapshot } from './source-scorecard-capture';
import { sanitizeProductThemeCss } from './product-theme-css';

/** Real-browser check that a themed product page keeps its protected controls visible, reachable and readable.
 * The raw cases bypass the sanitizer on purpose: they prove the check catches what allowed declarations could still do. */
const PREFIX = '[data-pagosya-product][data-style]';
const variant = (id: string, color: string, size: string) => ({ id, name: `${color} / ${size}`, amount: 12000, stock: 5, options: [{ name: 'Color', value: color }, { name: 'Talla', value: size }] });

async function themed(css: string, options: { variants?: boolean } = {}) {
  const kit = await kitDefaultSnapshot();
  return { ...kit, files: kit.files.map(file => {
    if (file.path !== 'config.js') return file;
    const config = JSON.parse(file.content.replace('window.PAGOSYA_CONFIG = ', '').replace(/;$/, ''));
    config.dna = { version: 1, productCss: css };
    if (options.variants) config.data.items[0] = { ...config.data.items[0], variants: [variant('v1', 'Rojo', 'S'), variant('v2', 'Rojo', 'M'), variant('v3', 'Azul', 'M')] };
    return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};` };
  }) };
}

describe('checkProductTheme', () => {
  it('passes the unthemed page and a benign theme', async () => {
    expect(await checkProductThemeOnSnapshot(await themed(''))).toEqual([]);
    const benign = sanitizeProductThemeCss('[data-part="gallery"]{border:2px solid #111}[data-part="block"]{border-radius:6px}').css;
    expect(benign.length).toBeGreaterThan(20);
    expect(await checkProductThemeOnSnapshot(await themed(benign, { variants: true }))).toEqual([]);
  });

  it('reports a buy button covered by an overlay that every declaration allows individually', async () => {
    const css = `${PREFIX} [data-part="title"]::before{content:"";position:absolute;top:-2000px;left:-2000px;width:6000px;height:6000px;z-index:2;background:#000}`;
    const failures = await checkProductThemeOnSnapshot(await themed(css));
    expect(failures.some(f => f.control === 'buy' && /covered/.test(f.reason))).toBe(true);
  });

  it('reports low text contrast on the price', async () => {
    // The kit re-picks the buy label's colour to suit any background, so a theme cannot make that button unreadable;
    // the price's colour it does not protect, and this raw rule (which the sanitizer would never emit) forces it pale.
    const failures = await checkProductThemeOnSnapshot(await themed(`${PREFIX} .product-detail__price{color:#ddd}`));
    expect(failures.some(f => f.control === 'price' && /contrast/.test(f.reason))).toBe(true);
  });

  it('reports horizontal overflow at phone width from a theme the sanitizer accepts', async () => {
    const css = sanitizeProductThemeCss('[data-part="gallery"]{width:900px}').css;
    expect(css.length).toBeGreaterThan(20);
    const failures = await checkProductThemeOnSnapshot(await themed(css));
    expect(failures).toEqual(expect.arrayContaining([expect.objectContaining({ control: 'page', viewport: 'mobile', reason: expect.stringMatching(/overflow/) })]));
  });

  it('reports option buttons shrunk below a usable target', async () => {
    const css = `${PREFIX} [data-part="swatch"]{width:8px;height:8px;min-width:0;min-height:0;padding:0;overflow:hidden}`;
    const failures = await checkProductThemeOnSnapshot(await themed(css, { variants: true }));
    expect(failures.some(f => f.control === 'option' && /small/.test(f.reason))).toBe(true);
  });

  it('reports a price hidden by opacity and a buy button that was made invisible', async () => {
    const failures = await checkProductThemeOnSnapshot(await themed(`${PREFIX} .product-detail__price{opacity:.2}${PREFIX} .product-detail__buy{display:none}`));
    expect(failures.some(f => f.control === 'price' && /transparent/.test(f.reason))).toBe(true);
    expect(failures.some(f => f.control === 'buy' && /hidden/.test(f.reason))).toBe(true);
  });
});

it('checks future purchasing controls for an empty store without changing its catalog', async () => {
  const empty = await themed('');
  const file = empty.files.find(file => file.path === 'config.js')!;
  const config = JSON.parse(file.content.replace('window.PAGOSYA_CONFIG = ', '').replace(/;$/, ''));
  config.data.items = [];
  file.content = `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};`;
  const before = JSON.stringify(empty);
  expect(await checkProductThemeOnSnapshot(empty)).toEqual([]);
  expect(JSON.stringify(empty)).toBe(before);
  config.dna.productCss = `${PREFIX} .product-detail__buy{display:none}`;
  file.content = `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};`;
  expect((await checkProductThemeOnSnapshot(empty)).some(f => f.control === 'buy' && /hidden/.test(f.reason))).toBe(true);
});
