import { describe, it, expect } from 'vitest';
import { prepareSourceMedia, validateSourceMediaBatch, MAX_SOURCE_VIDEO_BYTES } from './source-images';
const header = new Uint8Array([0, 0, 0, 12, 102, 116, 121, 112, 105, 115, 111, 109]);
describe('MP4 attachments', () => {
  it('preserves MP4 bytes and recognizes an empty browser MIME by extension', async () => {
    const file = new File([header], 'clip.mp4', { type: 'video/mp4' });
    expect(await prepareSourceMedia(file)).toBe(file);
    const normalized = await prepareSourceMedia(new File([header], 'CLIP.MP4'));
    expect(normalized.type).toBe('video/mp4');
    expect(new Uint8Array(await normalized.arrayBuffer())).toEqual(header);
  });
  it('rejects mislabeled and oversized videos with actionable errors', async () => {
    await expect(prepareSourceMedia(new File(['not video'], 'bad.mp4', { type: 'video/mp4' }))).rejects.toThrow('como video MP4');
    await expect(prepareSourceMedia(new File([new Uint8Array(MAX_SOURCE_VIDEO_BYTES + 1)], 'large.mp4', { type: 'video/mp4' }))).rejects.toThrow('20 MB');
  });
  it('keeps separate aggregate budgets for images and videos', () => {
    const file = (size: number, type: string) => ({ size, type } as File);
    expect(() => validateSourceMediaBatch([file(20_000_000, 'video/mp4'), file(6 * 1024 * 1024, 'image/webp')])).not.toThrow();
    expect(() => validateSourceMediaBatch([file(11_000_000, 'video/mp4'), file(10_000_000, 'video/mp4')])).toThrow('20 MB');
    expect(() => validateSourceMediaBatch([file(6 * 1024 * 1024 + 1, 'image/webp')])).toThrow('6 MB');
  });
});
