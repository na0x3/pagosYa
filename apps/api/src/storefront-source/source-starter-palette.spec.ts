import sharp from 'sharp';
import { palettesForPhoto, photoTone } from './source-starter-palette';

// A/B comparison 2026-10-24: PEPPA's red bottles got Vitrina's «limón» palette, a blue button beside red labels.
const solid = (r: number, g: number, b: number) => sharp({ create: { width: 64, height: 64, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();
const palettes = [
  { id: 'cereza', name: 'Cereza', paper: '#fdf3e3', ink: '#171311', muted: '#e8d4f2', accent: '#d7261e', deep: '#2a0f0c' },
  { id: 'limon', name: 'Limón', paper: '#fff8e1', ink: '#1a1a1a', muted: '#ffe23d', accent: '#1f5fd1', deep: '#10213f' },
  { id: 'menta', name: 'Menta', paper: '#f1fbf4', ink: '#14201a', muted: '#c9f0d6', accent: '#ff5a36', deep: '#0f3b2a' },
  { id: 'chicle', name: 'Chicle', paper: '#fff0f5', ink: '#221018', muted: '#ffd1e3', accent: '#7b3fe4', deep: '#2b0f3a' },
  { id: 'mono', name: 'Mono', paper: '#ffffff', ink: '#111111', muted: '#f2f2f2', accent: '#111111', deep: '#111111' },
];

describe('starter palettes for the hero photo', () => {
  it('reads a red photo as warm, a blue one as cool and a grey one as neutral', async () => {
    expect(await photoTone(await solid(200, 40, 30))).toBe('warm');
    expect(await photoTone(await solid(30, 70, 200))).toBe('cool');
    expect(await photoTone(await solid(128, 128, 128))).toBe('neutral');
  });

  it('a warm photo leaves out the cool-accent palettes, a cool one the warm-accent ones', () => {
    expect(palettesForPhoto(palettes, ['cereza', 'limon', 'menta', 'chicle'], 'warm')).toEqual(['cereza', 'menta']);
    expect(palettesForPhoto(palettes, ['cereza', 'limon', 'menta', 'chicle'], 'cool')).toEqual(['limon', 'chicle']);
  });

  it('a neutral photo, a neutral accent or a list that would empty keeps the starter’s list', () => {
    expect(palettesForPhoto(palettes, ['cereza', 'limon'], 'neutral')).toEqual(['cereza', 'limon']);
    expect(palettesForPhoto(palettes, ['mono', 'limon'], 'warm')).toEqual(['mono']);
    expect(palettesForPhoto(palettes, ['limon', 'chicle'], 'warm')).toEqual(['limon', 'chicle']);
  });

  it('an unreadable photo is neutral', async () => {
    expect(await photoTone(Buffer.from('not an image'))).toBe('neutral');
  });
});
