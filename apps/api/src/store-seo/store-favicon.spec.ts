import sharp from 'sharp';
import { DEFAULT_IDENTITY } from './store-identity';
import { faviconPng, faviconSize, markSvg, wordmarkSvg } from './store-favicon';

const identity = { fontId: 'instrument-serif', upper: false, ink: '#ffffff', ground: '#0b3d2e' };
const pixel = async (png: Buffer, x: number, y: number) => { const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true }); const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };

describe('store favicon', () => {
  it('accepts only the published sizes', () => {
    expect([faviconSize('180'), faviconSize(512), faviconSize('33'), faviconSize(undefined), faviconSize('x')]).toEqual([180, 512, 32, 32, 32]);
  });
  it('fits an uploaded logo into a square on the ground colour', async () => {
    const wide = await sharp({ create: { width: 300, height: 100, channels: 4, background: '#ff0000' } }).png().toBuffer();
    const png = await faviconPng({ logo: wide, name: 'Eje', identity, size: 180 });
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([180, 180, 'png']);
    expect(await pixel(png, 90, 5)).toEqual([0x0b, 0x3d, 0x2e]);
    expect(await pixel(png, 90, 90)).toEqual([255, 0, 0]);
  });
  it('draws the letter mark when there is no logo or the logo is corrupt', async () => {
    for (const logo of [null, Buffer.from('not an image')]) {
      const png = await faviconPng({ logo, name: 'Estudio Eje', identity, size: 32 });
      expect((await sharp(png).metadata()).width).toBe(32);
      expect(await pixel(png, 1, 1)).toEqual([0x0b, 0x3d, 0x2e]);
    }
  });
  it('falls back to the default font when the design font cannot draw, and to "?" for a blank name', () => {
    expect(markSvg('Eje', { ...identity, fontId: 'missing-font' })).toContain('fill="#0b3d2e"');
    expect(markSvg('   ', DEFAULT_IDENTITY)).toContain('<path');
    expect(wordmarkSvg('   ', DEFAULT_IDENTITY)).toContain('<path');
  });
});
