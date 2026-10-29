import sharp from 'sharp';
import { coverForPhoto, readPhotoFit, styleForCharacter } from './source-photo-fit';

// Owner 2026-10-28 («the picture is all stretched»): the cover follows the photo.
it('reads a small product on a plain backdrop, and a big scene', async () => {
  const product = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#f4f1ec' } })
    .composite([{ input: await sharp({ create: { width: 240, height: 360, channels: 3, background: '#c0392b' } }).png().toBuffer(), left: 280, top: 220 }]).jpeg().toBuffer();
  expect(await readPhotoFit(product)).toMatchObject({ shape: 'square', size: 'small', plain: 'plain' });
  const block = (colour: string) => sharp({ create: { width: 600, height: 500, channels: 3, background: colour } }).png().toBuffer();
  const scene = await sharp({ create: { width: 1800, height: 1000, channels: 3, background: '#2e7d32' } })
    .composite([{ input: await block('#f9a825'), left: 0, top: 0 }, { input: await block('#1565c0'), left: 1200, top: 500 }, { input: await block('#6d4c41'), left: 600, top: 500 }]).jpeg().toBuffer();
  expect(await readPhotoFit(scene)).toMatchObject({ shape: 'wide', size: 'large', plain: 'scene' });
});

it('never puts a small or plain product shot on a full-screen cover', () => {
  const small = { shape: 'square', size: 'small', plain: 'plain', focus: 'cc' } as const;
  const big = { shape: 'wide', size: 'large', plain: 'scene', focus: 'cc' } as const;
  expect(coverForPhoto('mesa', 'poster', small, ['split-left', 'poster', 'stack'])).toBe('split-left');
  expect(coverForPhoto('mesa', 'poster', big, ['split-left', 'poster', 'stack'])).toBe('poster');
  expect(coverForPhoto('tecno', 'full', small, ['split-left', 'full'])).toBe('split-left');
  expect(coverForPhoto('catalogo', 'full', small, ['split-left', 'full', 'type'])).toBe('type');
  expect(coverForPhoto('maison', 'full', { ...small, shape: 'tall' }, ['full', 'split-right', 'framed'])).toBe('split-right');
  expect(coverForPhoto('mesa', 'poster', undefined, [])).toBe('poster');
});

// Owner 2026-10-28: corners and buttons from the brand's character, not one look per template.
it('gives each brand character its corners and buttons', () => {
  expect(styleForCharacter({ tone: 'calm', kind: 'fashion' }, false)).toEqual({ corners: 'sharp', button: 'underline' });
  expect(styleForCharacter({ tone: 'calm', kind: 'other', temperature: 'warm' }, true)).toEqual({ corners: 'round', button: 'pill' });
  expect(styleForCharacter({ tone: 'bold', kind: 'other' }, false)).toEqual({ corners: 'round', button: 'pill' });
  expect(styleForCharacter({ tone: 'calm', kind: 'other', temperature: 'neutral' }, false)).toEqual({});
});
