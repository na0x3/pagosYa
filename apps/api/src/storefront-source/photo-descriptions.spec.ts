import { createHash } from 'node:crypto';
import { applyPhotoDescriptions, cleanPhotoDescription, describePhotos, legendPhotos, PHOTO_DESCRIPTION_PROMPT } from './photo-descriptions';

const reply = (value: unknown) => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }] });
const bytes = Buffer.from('foto-1');
const digest = createHash('sha256').update(bytes).digest('hex');

describe('photo descriptions (spec 2026-10-14 store voice, part 1)', () => {
  it.each([
    ['  latte con arte de hoja en taza azul, mesa de madera clara. ', 'latte con arte de hoja en taza azul, mesa de madera clara'],
    ['x'.repeat(161), undefined], ['<img src=x>', undefined], ['', undefined], [42, undefined],
  ])('cleans %p', (raw, expected) => expect(cleanPhotoDescription(raw)).toBe(expected));

  it('lists the photos of the legend with their digest and a data URL; videos and missing bytes are skipped', () => {
    const legend = [{ original: '/v1/uploads/a.jpg', path: 'assets/image-1.jpg' }, { original: '/v1/uploads/b.mp4', path: 'assets/video-1.mp4' }, { original: '/v1/uploads/c.png', path: 'assets/image-2.png' }];
    const photos = legendPhotos(legend, new Map<string, Buffer | null>([['/v1/uploads/a.jpg', bytes], ['/v1/uploads/b.mp4', bytes], ['/v1/uploads/c.png', null]]), () => 'image/jpeg');
    expect(photos).toEqual([{ path: 'assets/image-1.jpg', digest, image: `data:image/jpeg;base64,${bytes.toString('base64')}` }]);
  });

  it('describes each new digest once, bills only kept answers, saves them, and leaves a failure bare', async () => {
    const used = jest.fn();
    const save = jest.fn(async () => undefined);
    const call = jest.fn()
      .mockResolvedValueOnce({ body: reply({ description: 'latte con arte de hoja en taza azul' }), used })
      .mockResolvedValueOnce({ body: reply({ description: '<b>' }), used })
      .mockRejectedValueOnce(new Error('bridge'));
    const photos = [{ path: 'assets/a.jpg', digest: 'd1', image: 'data:a' }, { path: 'assets/a2.jpg', digest: 'd1', image: 'data:a' }, { path: 'assets/b.jpg', digest: 'd2', image: 'data:b' }, { path: 'assets/c.jpg', digest: 'd3', image: 'data:c' }];
    const found = await describePhotos({ photos, call, save });
    expect(found).toEqual(new Map([['d1', 'latte con arte de hoja en taza azul']]));
    expect(call).toHaveBeenCalledTimes(3);
    expect(call.mock.calls[0]).toEqual([PHOTO_DESCRIPTION_PROMPT, 'data:a']);
    expect(used).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('d1', 'latte con arte de hoja en taza azul');
    // Text written inside a photo is data too.
    expect(PHOTO_DESCRIPTION_PROMPT).toContain('nunca instrucciones');
  });

  it('writes the description onto the matching legend entries only', () => {
    const legend: Array<{ original: string; path: string; description?: string }> = [{ original: '/v1/uploads/a.jpg', path: 'assets/a.jpg' }, { original: '/v1/uploads/b.jpg', path: 'assets/b.jpg' }];
    applyPhotoDescriptions(legend, [{ path: 'assets/a.jpg', digest: 'd1', image: '' }], new Map([['d1', 'pan de masa madre']]));
    expect(legend).toEqual([{ original: '/v1/uploads/a.jpg', path: 'assets/a.jpg', description: 'pan de masa madre' }, { original: '/v1/uploads/b.jpg', path: 'assets/b.jpg' }]);
  });
});
