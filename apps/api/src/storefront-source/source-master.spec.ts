import type { MasterSettings } from '@pagosya/store-templates';
import { masterColours, masterCopy, masterDnaFonts, masterLook, masterThemeCss, withMasterTheme, MASTER_THEME_START, MASTER_THEME_END } from './source-master';
import { contrastRatio } from './sketch/sketch-schema';

const values = [{ title: 'Uno', text: 'Primero' }, { title: 'Dos', text: 'Segundo' }, { title: 'Tres', text: 'Tercero' }];
const settings: MasterSettings = {
  copy: { announcement: '', eyebrow: 'Nueva colección', headline: 'Hecho con cuidado', subcopy: 'Sub', primaryCta: 'Ver la colección', secondaryCta: 'Nuestra historia', productsTitle: 'Productos', storyTitle: 'Historia', storyBody: 'Cuerpo', values, closingLine: 'Cierre', closingCta: 'Ver todo', tagline: '' },
  palettes: [{ id: 'terracotta', name: 'Terracota', paper: '#f6f1ea', ink: '#1f1a17', muted: '#ede6dc', accent: '#b8553a', deep: '#2b211c' }, { id: 'gold', name: 'Oro', paper: '#141210', ink: '#f2ece2', muted: '#1e1b18', accent: '#c9a45c', deep: '#0b0a09' }],
  fonts: [{ id: 'classic', name: 'Clásica', heading: 'cormorant-garamond', body: 'dm-sans' }, { id: 'modern', name: 'Moderna', heading: 'fraunces', body: 'geist' }],
};

describe('masterCopy', () => {
  it('keeps defaults for missing or blank fields and clips to the caps', () => {
    const copy = masterCopy(settings, { headline: '  ' + 'x'.repeat(200), subcopy: '' });
    expect(copy.headline).toHaveLength(70);
    expect(copy.subcopy).toBe('Sub');
    expect(copy.eyebrow).toBe('Nueva colección');
  });
  it('lets the announcement and tagline be empty on purpose', () => {
    expect(masterCopy({ ...settings, copy: { ...settings.copy, announcement: 'Envío gratis' } }, { announcement: '' }).announcement).toBe('');
  });
  it('always has three values, filling the missing ones from the defaults', () => {
    expect(masterCopy(settings, { values: [{ title: 'Propio', text: 'Texto' }] as any }).values).toEqual([{ title: 'Propio', text: 'Texto' }, values[1], values[2]]);
  });
});

describe('masterLook', () => {
  it('falls back to the first palette and pair for unknown ids and drops colours that are not #rrggbb', () => {
    expect(masterLook(settings, { palette: 'nope', fonts: 'nope', colors: { accent: 'red', paper: '#FFFFFF' } })).toEqual({ palette: 'terracotta', fonts: 'classic', colors: { paper: '#ffffff' } });
  });
});

describe('masterColours', () => {
  it('corrects unreadable custom ink', () => {
    const colours = masterColours(settings, { palette: 'terracotta', fonts: 'classic', colors: { paper: '#ffff33', ink: '#ffffff' } });
    expect(contrastRatio(colours.paper, colours.ink)).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps text readable on the muted surfaces when the merchant inverts the colours (review fix 4)', () => {
    const dark = masterColours(settings, { palette: 'terracotta', fonts: 'classic', colors: { paper: '#000000', ink: '#ffffff' } });
    expect(contrastRatio(dark.muted, dark.ink)).toBeGreaterThanOrEqual(4.5);
    const light = masterColours(settings, { palette: 'gold', fonts: 'classic', colors: { paper: '#ffffff' } });
    expect(contrastRatio(light.muted, light.ink)).toBeGreaterThanOrEqual(4.5);
  });
  it('picks a readable text colour on the accent', () => {
    const colours = masterColours(settings, { palette: 'gold', fonts: 'classic', colors: {} });
    expect(contrastRatio(colours.accent, colours.onAccent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('masterThemeCss', () => {
  it('declares both fonts from the kit catalogue and every colour variable', () => {
    const css = masterThemeCss(settings, masterLook(settings, { fonts: 'modern' }));
    expect(css.startsWith(MASTER_THEME_START)).toBe(true);
    expect(css.endsWith(MASTER_THEME_END)).toBe(true);
    expect(css).toContain('src:url(assets/fraunces.ttf)');
    expect(css).toContain('src:url(assets/geist.ttf)');
    expect(css).toMatch(/--es-heading:'Fraunces'/);
    for (const name of ['paper', 'ink', 'muted', 'accent', 'deep', 'on-accent', 'on-deep']) expect(css).toContain(`--es-${name}:#`);
  });
  it('maps the pair onto the kit DNA fonts', () => {
    expect(masterDnaFonts(settings, masterLook(settings, { fonts: 'modern' }))).toEqual({ display: 'fraunces', text: 'geist' });
  });
});

describe('withMasterTheme', () => {
  it('replaces an existing block and prepends a missing one, idempotently', () => {
    const block = `${MASTER_THEME_START}\n:root{--es-paper:#000000}\n${MASTER_THEME_END}`;
    const once = withMasterTheme('body{margin:0}', block);
    expect(once).toBe(`${block}\nbody{margin:0}`);
    expect(withMasterTheme(once, block)).toBe(once);
    expect(withMasterTheme(once, block.replace('#000000', '#ffffff'))).toContain('--es-paper:#ffffff');
  });
});
