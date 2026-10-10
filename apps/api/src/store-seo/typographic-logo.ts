import * as fontkit from 'fontkit';

/** A store name drawn as outlines: no font is needed to display it, and it holds only allow-listed SVG. */
export type LogoMode = 'wordmark' | 'mark';
export type TypographicLogoInput = { name: string; fontPath: string; ink: string; ground: string; mode: LogoMode; upper?: boolean };

export const LOGO_INK = '#111111';
export const LOGO_GROUND = '#ffffff';
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const MARK_BOX = 100;
const MARK_FILL = 0.64;
const WORDMARK_HEIGHT = 100;
const WORDMARK_PAD = 8;
const fonts = new Map<string, any>();

export const safeHex = (value: string, fallback: string) => HEX.test(value) ? value : fallback;
const round = (value: number) => Math.round(value * 100) / 100;

function openFont(path: string) {
  let font = fonts.get(path);
  if (!font) {
    font = fontkit.openSync(path);
    // Variable fonts open at their default instance, usually a light weight; a logo reads better bold.
    const weight = font.variationAxes?.wght;
    if (weight) font = font.getVariation({ wght: Math.min(Math.max(700, weight.min), weight.max) });
    fonts.set(path, font);
  }
  return font;
}

export function typographicLogo(input: TypographicLogoInput): string {
  const name = input.name.trim();
  const base = input.mode === 'mark' ? (Array.from(name)[0] ?? '') : name;
  const text = input.upper ? base.toLocaleUpperCase('es') : base;
  if (!text) throw new Error('Nothing to draw');
  const font = openFont(input.fontPath);
  const run = font.layout(text);
  const box = run.bbox;
  if (!(box.maxX > box.minX && box.maxY > box.minY)) throw new Error('Text has no outline');
  const ink = safeHex(input.ink, LOGO_INK);
  const ground = safeHex(input.ground, LOGO_GROUND);
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const mark = input.mode === 'mark';
  const scale = mark ? (MARK_BOX * MARK_FILL) / Math.max(width, height) : (WORDMARK_HEIGHT - 2 * WORDMARK_PAD) / height;
  const viewWidth = mark ? MARK_BOX : width * scale + 2 * WORDMARK_PAD;
  const viewHeight = mark ? MARK_BOX : WORDMARK_HEIGHT;
  const left = mark ? (MARK_BOX - width * scale) / 2 : WORDMARK_PAD;
  const top = mark ? (MARK_BOX - height * scale) / 2 : WORDMARK_PAD;
  // Font units are y-up; flip them and place the run's box at (left, top).
  const tx = left - box.minX * scale;
  const ty = top + box.maxY * scale;
  let pen = 0;
  const d: string[] = [];
  run.glyphs.forEach((glyph: any, index: number) => {
    const position = run.positions[index];
    d.push(glyph.path.scale(scale, -scale).translate(tx + (pen + position.xOffset) * scale, ty - position.yOffset * scale).toSVG());
    pen += position.xAdvance;
  });
  const rect = mark ? `<rect width="${MARK_BOX}" height="${MARK_BOX}" fill="${ground}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(viewWidth)} ${round(viewHeight)}" width="${round(viewWidth)}" height="${round(viewHeight)}">${rect}<path fill="${ink}" d="${d.join('')}"/></svg>`;
}
