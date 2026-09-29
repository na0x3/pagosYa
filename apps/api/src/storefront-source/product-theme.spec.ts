import { resolveProductTheme } from './product-theme';
import { presetFor } from './source-product-card-presets';
import { sanitizeProductThemeCss } from './product-theme-css';
import type { ThemeCheckFailure } from './product-theme-check';

const failure: ThemeCheckFailure = { control: 'buy', viewport: 'mobile', reason: 'covered by another element' };

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
