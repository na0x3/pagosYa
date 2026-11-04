import { templateManifest } from '@pagosya/store-templates';
import { bindThemeAccent, templateLook } from './source-master';

// Spec 2026-11-01 template quick edits §2: a template's accent follows the store's colour.
describe('template colours', () => {
  const css = [
    ':root{--x:#dfff1f}',
    '/* theme:zancada */',
    '[data-es-theme="zancada"] .es-logo{color:var(--es-base-accent,#DFFF1F)}',
    '[data-es-theme="zancada"] .es-btn{background:var(--es-base-accent,#dfff1f);color:#111;border-color:#dfff1f}',
    '[data-es-theme="zancada"] :is([data-lb-band="accent"]) :is(p,h2){color:#111}',
    '[data-es-theme="zancada"] .es-footer{background:#151515;color:#fff}',
    '/* /theme:zancada */',
    '/* theme:otra */ .y{color:#dfff1f} /* /theme:otra */',
  ].join('\n');

  it('binds the preset accent inside the store theme only, and the text drawn on it', () => {
    const bound = bindThemeAccent(css, 'zancada', { accent: '#dfff1f', paper: '#1f1f1f', ink: '#ffffff', deep: '#151515' });
    const theme = bound.slice(bound.indexOf('/* theme:zancada */'), bound.indexOf('/* /theme:zancada */'));
    expect(theme).not.toMatch(/#dfff1f/i);
    expect(theme).toContain('.es-logo{color:var(--es-base-accent,var(--es-accent))}');
    expect(theme).toContain('background:var(--es-base-accent,var(--es-accent));color:var(--es-on-accent);border-color:var(--es-accent)');
    // Inside an accent band --es-on-accent is redrawn as the accent: the band's words take the store's own text-on-accent.
    expect(theme).toContain(':is(p,h2){color:var(--es-base-on-accent)}');
    expect(bindThemeAccent(bound.replace(':is(p,h2){color:var(--es-base-on-accent)}', ':is(p,h2){color:var(--es-on-accent)}'), 'zancada', { accent: '#dfff1f', paper: '#1f1f1f', ink: '#ffffff', deep: '#151515' })).toContain(':is(p,h2){color:var(--es-base-on-accent)}');
    // Not on the accent: untouched.
    expect(theme).toContain('.es-footer{background:#151515;color:#fff}');
    expect(bound).toContain(':root{--x:#dfff1f}');
    expect(bound).toContain('.y{color:#dfff1f}');
    expect(bindThemeAccent(bound, 'zancada', { accent: '#dfff1f', paper: '#1f1f1f', ink: '#ffffff', deep: '#151515' })).toBe(bound);
  });

  it('a section the kit paints on the accent takes the store text-on-accent for its fixed white or black words', () => {
    const sheet = ['.lb-cover-ribbon{background:var(--es-base-accent);--es-on-accent:var(--es-base-accent)}', '/* theme:gumdrop */',
      '[data-es-theme="gumdrop"] .lb-bleed.lb-cover-ribbon{background:var(--es-base-accent,var(--es-accent));color:var(--es-on-accent);--es-ink:#fff}',
      '[data-es-theme="gumdrop"] .lb-cover-ribbon :is(h1,p){color:#fff}', '[data-es-theme="gumdrop"] .lb-cover-ribbon .lb-em{color:#ffb98a}',
      '[data-es-theme="gumdrop"] .lb-cover-ribbonx h1{color:#fff}', '/* /theme:gumdrop */'].join('\n');
    const bound = bindThemeAccent(sheet, 'gumdrop', { accent: '#7a4cff', paper: '#fff8ef', ink: '#2b1d3a', deep: '#2b1d3a' });
    expect(bound).toContain('.lb-cover-ribbon{background:var(--es-base-accent,var(--es-accent));color:var(--es-base-on-accent);--es-ink:var(--es-base-on-accent)}');
    expect(bound).toContain('.lb-cover-ribbon :is(h1,p){color:var(--es-base-on-accent)}');
    expect(bound).toContain('.lb-em{color:#ffb98a}');
    expect(bound).toContain('.lb-cover-ribbonx h1{color:#fff}');
    expect(bindThemeAccent(bound, 'gumdrop', { accent: '#7a4cff', paper: '#fff8ef', ink: '#2b1d3a', deep: '#2b1d3a' })).toBe(bound);
  });

  it('leaves a theme alone when its accent is also its paper, ink or deep, or the theme is missing', () => {
    expect(bindThemeAccent(css, 'zancada', { accent: '#dfff1f', paper: '#dfff1f', ink: '#111111', deep: '#151515' })).toBe(css);
    expect(bindThemeAccent(css, 'nadie', { accent: '#dfff1f', paper: '#1f1f1f', ink: '#ffffff', deep: '#151515' })).toBe(css);
  });

  it('binds every themed template on its own stylesheet without changing its look', () => {
    const { readFileSync } = jest.requireActual('node:fs') as typeof import('node:fs');
    const sheet = readFileSync(require.resolve('@pagosya/store-templates/templates/esencial/styles/globals.css'), 'utf8');
    const zancada = templateManifest('zancada')!.preset!.colors as Record<string, string>;
    const bound = bindThemeAccent(sheet, 'zancada', zancada);
    expect(bound).not.toBe(sheet);
    expect(bound.match(/var\(--es-accent\)/g)!.length).toBeGreaterThanOrEqual(7);
  });

  it('a template keeps its colours and takes only the asked accent', () => {
    const settings = templateManifest('esencial')!.master!;
    const current = { palette: 'mono', fonts: 'zancada', colors: { paper: '#1f1f1f', ink: '#ffffff', muted: '#2b2b2b', accent: '#dfff1f', deep: '#151515' } };
    // The fill copied every colour and changed the palette: the palette's accent is taken.
    const limon = settings.palettes.find(palette => palette.id !== 'mono')!;
    const byPalette = templateLook(settings, current, { palette: limon.id, fonts: 'zancada', colors: { ...current.colors } });
    expect(byPalette.colors).toEqual({ ...current.colors, accent: limon.accent.toLowerCase() });
    // An accent named outright wins; paper and ink the fill changed are not taken.
    const named = templateLook(settings, current, { palette: 'mono', fonts: 'zancada', colors: { ...current.colors, accent: '#2E8B57', paper: '#ffffff' } });
    expect(named.colors).toEqual({ ...current.colors, accent: '#2e8b57' });
    // No colour asked: unchanged.
    expect(templateLook(settings, current, { palette: 'mono', fonts: 'zancada', colors: { ...current.colors } }).colors).toEqual(current.colors);
  });
});

// Owner 2026-11-02 (DooBoo): the accent as words on the page reads even when the brand's accent is pale.
describe('accent words on the page', () => {
  const { accentInk, readableAccentText } = jest.requireActual('./source-master') as typeof import('./source-master');
  const { contrastRatio } = jest.requireActual('./sketch/sketch-schema') as typeof import('./sketch/sketch-schema');
  it('keeps a readable accent and darkens a pale one in its family', () => {
    expect(accentInk('#5b2a86', '#f6f4ee', '#261b19')).toBe('#5b2a86');
    const pale = accentInk('#e4ddcc', '#f6f4ee', '#261b19');
    expect(pale).not.toBe('#e4ddcc');
    expect(contrastRatio(pale, '#f6f4ee')).toBeGreaterThanOrEqual(4.5);
  });
  it('rewrites only text on the page, never on an accent, a band or a coloured background', () => {
    const css = '.a .h2{font-weight:700;color:var(--es-accent)}.b{background:var(--es-accent);color:var(--es-on-accent)}'
      + '.es-header{color:var(--es-accent)}[data-lb-band="deep"] h2{color:var(--es-accent)}.c{border-color:var(--es-accent)}';
    const out = readableAccentText(css);
    expect(out).toContain('.a .h2{font-weight:700;color:var(--es-accent-ink,var(--es-accent))}');
    expect(out).toContain('.es-header{color:var(--es-accent)}');
    expect(out).toContain('[data-lb-band="deep"] h2{color:var(--es-accent)}');
    expect(out).toContain('.c{border-color:var(--es-accent)}');
    expect(readableAccentText(out)).toBe(out);
  });
  it('an accent band that redraws the accent redraws the accent words with it', () => {
    const css = ':root{--es-accent:#471411;--es-accent-ink:#471411}[data-lb-band="accent"]{--es-paper:var(--es-base-accent);--es-accent:var(--es-base-on-accent)}';
    const out = readableAccentText(css);
    expect(out).toContain(':root{--es-accent:#471411;--es-accent-ink:#471411}');
    expect(out).toContain('--es-accent:var(--es-base-on-accent);--es-accent-ink:var(--es-base-on-accent)}');
    expect(readableAccentText(out)).toBe(out);
  });
});
