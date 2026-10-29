import { coverCandidates } from './source-cover-pick';
import type { PhotoFit } from './source-photo-fit';

const fit = (size: PhotoFit['size'], plain: PhotoFit['plain'], shape: PhotoFit['shape'] = 'tall'): PhotoFit => ({ size, plain, shape, focus: 'cc' });

describe('cover photo candidates (2026-10-28)', () => {
  it('puts a large real scene first and drops small product cut-outs when a scene exists', () => {
    expect(coverCandidates([
      { url: 'cutout-1', fit: fit('small', 'plain') },
      { url: 'scene', fit: fit('large', 'scene') },
      { url: 'cutout-2', fit: fit('small', 'plain') },
    ])).toEqual(['scene']);
  });
  it('keeps every photo, best first, when all are plain product shots', () => {
    expect(coverCandidates([{ url: 'small', fit: fit('small', 'plain') }, { url: 'large', fit: fit('large', 'plain', 'wide') }])).toEqual(['large', 'small']);
  });
  it('gives nothing without photos and at most six', () => {
    expect(coverCandidates([])).toEqual([]);
    expect(coverCandidates(Array.from({ length: 9 }, (_, i) => ({ url: `p${i}`, fit: fit('large', 'scene') })))).toHaveLength(6);
  });
});
