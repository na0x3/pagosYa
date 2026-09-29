import { applyProductThemeToDesign, instructionConcernsProductCard, productThemeRuntime, resolveProductTheme, snapshotWithProductTheme } from './product-theme';
import { validDna } from './fixtures/dna';
import { presetFor } from './source-product-card-presets';
import { sanitizeProductThemeCss } from './product-theme-css';
import type { ThemeCheckFailure } from './product-theme-check';

const failure: ThemeCheckFailure = { control: 'buy', viewport: 'mobile', reason: 'covered by another element' };

const design = (selected = 1) => ({ selected, concepts: [0, 1, 2].map(i => ({ name: `c${i}`, dna: { ...validDna(), signature: `sig${i}` } })) }) as never;
const theme = { productCard: presetFor('workshop').params, productCss: '[data-pagosya-product][data-style] [data-part="title"]{color:#111}' };

describe('applyProductThemeToDesign', () => {
  it('writes the theme into the selected concept\'s DNA and leaves the others alone', () => {
    const next = applyProductThemeToDesign(design(1), theme) as any;
    expect(next.concepts[1].dna.productCard).toEqual(theme.productCard);
    expect(next.concepts[1].dna.productCss).toBe(theme.productCss);
    expect(next.concepts[0].dna.productCard).toEqual(validDna().productCard);
    expect(next.concepts[2].dna.productCss).toBe('');
    expect(next.concepts[1].dna.signature).toBe('sig1');
  });

  it('does not mutate its input, and can clear the CSS while keeping the params', () => {
    const before = design(0);
    const snapshot = JSON.stringify(before);
    const next = applyProductThemeToDesign(before, { ...theme, productCss: '' }) as any;
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(next.concepts[0].dna.productCss).toBe('');
    expect(next.concepts[0].dna.productCard).toEqual(theme.productCard);
  });

  it('returns the design as it is with no theme, no design, or a concept without DNA', () => {
    const d = design();
    expect(applyProductThemeToDesign(d, null)).toBe(d);
    expect(applyProductThemeToDesign(undefined, theme)).toBeUndefined();
    const bare = { selected: 0, concepts: [{ name: 'x' }] } as never;
    expect(applyProductThemeToDesign(bare, theme)).toBe(bare);
  });
});

describe('snapshotWithProductTheme', () => {
  const config = (content: string) => JSON.parse(content.replace('window.PAGOSYA_CONFIG = ', '').replace(/;$/, ''));
  const snap = (content: string) => ({ files: [{ path: 'index.html', content: '<p/>' }, { path: 'config.js', content }] });

  it('creates dna when the store has none, so the runtime does not ignore the theme', () => {
    const next = snapshotWithProductTheme(snap('window.PAGOSYA_CONFIG = {"slug":"x"};'), theme);
    expect(config(next.files[1].content)).toEqual({ slug: 'x', dna: { version: 1, ...theme.productCard, productCss: theme.productCss } });
    expect(next.files[0]).toEqual({ path: 'index.html', content: '<p/>' });
  });

  it('keeps the store\'s other DNA and replaces its old product theme, clearing CSS when the theme has none', () => {
    const next = snapshotWithProductTheme(snap('window.PAGOSYA_CONFIG = {"dna":{"version":1,"button":"pill","swatch":"photo","productCss":"old"}};'), { ...theme, productCss: '' });
    expect(config(next.files[1].content).dna).toEqual({ version: 1, button: 'pill', ...theme.productCard, productCss: '' });
  });

  it('leaves a config it cannot read as it is', () => {
    const broken = snap('window.PAGOSYA_CONFIG = {oops');
    expect(snapshotWithProductTheme(broken, theme).files[1].content).toBe('window.PAGOSYA_CONFIG = {oops');
  });
});

describe('productThemeRuntime', () => {
  it('gives the runtime DNA fields for a theme, and only includes productCss when there is one', () => {
    expect(productThemeRuntime(theme)).toEqual({ ...theme.productCard, productCss: theme.productCss });
    expect(productThemeRuntime({ ...theme, productCss: '' })).toEqual(theme.productCard);
  });
});

describe('instructionConcernsProductCard', () => {
  it.each([
    'cambia la ficha de producto', 'mejora la ficha del producto para que se vea más artesanal', 'haz la tarjeta de producto más grande',
    'the product page should feel like a workshop', 'restyle the product card', 'quiero que la página de producto muestre las fotos apiladas', 'cambia los colores de las opciones del producto',
  ])('recognises %s', text => expect(instructionConcernsProductCard(text)).toBe(true));
  it.each(['cambia el título de la portada', 'agrega una sección de preguntas', 'change the hero photo', 'mueve el menú', ''])('ignores %s', text => expect(instructionConcernsProductCard(text)).toBe(false));
});

describe('resolveProductTheme', () => {
  it('starts from the plain preset when given nothing', async () => {
    const result = await resolveProductTheme({});
    expect(result.dna).toEqual({ productCard: presetFor('plain').params, productCss: '' });
    expect(result.report).toEqual({ dropped: [], failures: [] });
  });

  it('uses a preset\'s params and its sanitized starter CSS', async () => {
    const result = await resolveProductTheme({ preset: 'workshop' });
    expect(result.dna.productCard).toEqual(presetFor('workshop').params);
    expect(result.dna.productCss).toBe(sanitizeProductThemeCss(presetFor('workshop').css).css);
    expect(result.dna.productCss.length).toBeGreaterThan(100);
    expect(result.report).toEqual({ dropped: [], failures: [], presetUsed: 'workshop' });
  });

  it('lets params override the preset one dimension at a time', async () => {
    const result = await resolveProductTheme({ preset: 'workshop', params: { swatch: 'circle' } });
    expect(result.dna.productCard).toEqual({ ...presetFor('workshop').params, swatch: 'circle' });
  });

  it('appends the caller\'s CSS after the preset\'s and reports what the sanitizer dropped', async () => {
    const result = await resolveProductTheme({ preset: 'craft', css: '[data-part="title"]{color:#111;pointer-events:none}' });
    expect(result.dna.productCss).toContain('color: #111');
    expect(result.dna.productCss).not.toContain('pointer-events');
    expect(result.dna.productCss.indexOf('font-style')).toBeLessThan(result.dna.productCss.indexOf('color: #111'));
    expect(result.report.dropped).toEqual([expect.objectContaining({ declaration: expect.stringContaining('pointer-events') })]);
  });

  it('checks the sanitized CSS once and removes it, keeping the params, when the browser check fails', async () => {
    const check = jest.fn(async (_css: string) => [failure]);
    const result = await resolveProductTheme({ preset: 'workshop' }, { check });
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(sanitizeProductThemeCss(presetFor('workshop').css).css);
    expect(result.dna.productCss).toBe('');
    expect(result.dna.productCard).toEqual(presetFor('workshop').params);
    expect(result.report.failures).toEqual([failure]);
  });

  it('keeps the CSS when the check passes, and never runs the check with no CSS', async () => {
    const pass = jest.fn(async (_css: string): Promise<ThemeCheckFailure[]> => []);
    expect((await resolveProductTheme({ preset: 'atelier' }, { check: pass })).dna.productCss.length).toBeGreaterThan(50);
    const none = jest.fn(async (_css: string) => [failure]);
    const plain = await resolveProductTheme({ preset: 'plain' }, { check: none });
    expect(none).not.toHaveBeenCalled();
    expect(plain.report.failures).toEqual([]);
  });

  it('rejects an unknown preset and an invalid param value, naming them', async () => {
    await expect(resolveProductTheme({ preset: 'hexagon' as never })).rejects.toThrow('unknown preset');
    await expect(resolveProductTheme({ params: { swatch: 'hexagon' } as never })).rejects.toThrow(/swatch/);
    await expect(resolveProductTheme({ params: { sparkle: 'yes' } as never })).rejects.toThrow(/sparkle/);
  });

  it('fails closed on oversized CSS while keeping the params', async () => {
    const result = await resolveProductTheme({ preset: 'gallery', css: 'a'.repeat(3000) });
    expect(result.dna.productCss).toBe('');
    expect(result.dna.productCard).toEqual(presetFor('gallery').params);
    expect(result.report.dropped[0].reason).toMatch(/long|3000/);
  });
});
