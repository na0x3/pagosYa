import { templateManifest } from '@pagosya/store-templates';
import { SOURCE_FONT_IDS } from './source-font-catalog';
import { masterThemeBlock, masterThemeCss, MASTER_THEME_START, MASTER_THEME_END } from './source-master';

// Spec 2026-10-29 home page writer: set_tokens writes the same theme block the template fill writes.
describe('masterThemeBlock', () => {
  const [heading, body] = SOURCE_FONT_IDS;
  const colours = { paper: '#f4efe6', ink: '#1d2a22', muted: '#e8e1d4', accent: '#b5562b', deep: '#2f4a33' };
  it('writes the variables and both font faces from catalog ids', () => {
    const block = masterThemeBlock(colours, heading, body);
    expect(block.startsWith(MASTER_THEME_START) && block.endsWith(MASTER_THEME_END)).toBe(true);
    expect(block).toContain('--es-paper:#f4efe6');
    expect(block).toContain('--es-deep:#2f4a33');
    expect(block).toContain(`url(assets/${heading}.ttf)`);
    expect(block).toContain(`url(assets/${body}.ttf)`);
  });
  it('replaces ink that cannot be read on the paper', () => {
    expect(masterThemeBlock({ ...colours, ink: '#f0ebe2' }, heading, body)).not.toContain('--es-ink:#f0ebe2');
  });
  it('refuses a font outside the catalog', () => {
    expect(() => masterThemeBlock(colours, 'comic-sans', body)).toThrow(TypeError);
  });
  it('leaves masterThemeCss whole for every palette and font pair', () => {
    const settings = templateManifest('esencial')!.master! as any;
    for (const palette of settings.palettes) for (const pair of settings.fonts) {
      const css = masterThemeCss(settings, { palette: palette.id, fonts: pair.id, colors: {} });
      expect(css).toContain(MASTER_THEME_START);
      expect(css).toContain(`url(assets/${pair.heading}.ttf)`);
    }
  });
});
