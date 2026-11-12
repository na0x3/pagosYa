import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { withPhotoWidths } from './source-photo-size';

// Owner 2026-11-11 («no blurry cover photos»): YAPI knows how wide each of the store's photos is.
describe('withPhotoWidths', () => {
  it('reads the width of each local upload and leaves other photos without one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'photo-size-'));
    writeFileSync(join(dir, 'wide.jpg'), await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#fff' } }).jpeg().toBuffer());
    const out = await withPhotoWidths([{ url: '/v1/uploads/wide.jpg', product: 'Soda' }, { url: '/v1/uploads/missing.jpg' }, { url: 'https://example.com/x.jpg' }], dir);
    expect(out).toEqual([{ url: '/v1/uploads/wide.jpg', product: 'Soda', width: 1600 }, { url: '/v1/uploads/missing.jpg' }, { url: 'https://example.com/x.jpg' }]);
  });
});
