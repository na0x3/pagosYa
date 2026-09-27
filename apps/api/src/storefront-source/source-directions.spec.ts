import { DESIGN_DIRECTIONS, directionBrief, rankDirections } from './source-directions';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

describe('design directions', () => {
  it('are bold, readable and use only fonts the stores can load', () => {
    const fonts = new Set<string>(SOURCE_FONT_CATALOG.map(font => font.id));
    expect(DESIGN_DIRECTIONS.length).toBeGreaterThanOrEqual(9);
    expect(new Set(DESIGN_DIRECTIONS.map(d => d.id)).size).toBe(DESIGN_DIRECTIONS.length);
    for (const direction of DESIGN_DIRECTIONS) {
      expect(fonts.has(direction.fonts.display)).toBe(true);
      expect(fonts.has(direction.fonts.text)).toBe(true);
      for (const color of Object.values(direction.palette)) expect(color).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(direction.palette.ink, direction.palette.background)).toBeGreaterThanOrEqual(7);
      expect(contrast(direction.palette.ink, direction.palette.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('offers three different directions, the ones that fit the business first', () => {
    const burgers = rankDirections('Hamburguesería retro con malteadas y papas, estilo diner americano');
    expect(burgers).toHaveLength(3);
    expect(new Set(burgers.map(d => d.id)).size).toBe(3);
    expect(burgers[0].id).toBe('retro-americana');
    expect(rankDirections('Joyería fina de oro y plata')[0].id).toBe('lujo-sobrio');
    expect(rankDirections('')).toHaveLength(3);
  });
  it('turn into a binding instruction for the build', () => {
    const brief = directionBrief(DESIGN_DIRECTIONS.find(d => d.id === 'retro-americana')!);
    expect(brief).toContain('Retro americana');
    expect(brief).toContain('assets/bebas-neue.ttf');
    expect(brief).toMatch(/#[0-9a-f]{6}/);
  });
});
