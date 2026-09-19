import * as fs from 'fs';
import sharp from 'sharp';
import { UploadsService } from './uploads.service';

describe('responsive upload copies', () => {
  let dir: string; let service: UploadsService;
  beforeEach(async () => {
    dir = await fs.promises.mkdtemp('/tmp/pagosya-responsive-test-');
    service = new UploadsService({ get: (key: string) => key === 'app.uploadsDir' ? dir : undefined } as any);
  });
  afterEach(() => fs.promises.rm(dir, { recursive: true, force: true }));
  const read = async (file: { stream: NodeJS.ReadableStream }) => { const chunks: Buffer[] = []; for await (const chunk of file.stream) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); };

  it('serves a cached, width-limited WebP and never enlarges', async () => {
    const photo = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#b4532a' } }).jpeg().toBuffer();
    const stored = await service.saveBuffer(photo, 'image/jpeg');
    const small = await read((await service.getResized(stored.filename, 480))!);
    expect(await sharp(small).metadata()).toMatchObject({ format: 'webp', width: 480, height: 320 });
    expect(small.byteLength).toBeLessThan(photo.byteLength);
    expect(fs.readdirSync(dir).some(name => name.endsWith('.w480.webp'))).toBe(true);
    // A second request reads the cached copy.
    const spy = jest.spyOn(service, 'getBuffer');
    await read((await service.getResized(stored.filename, 480))!);
    expect(spy).not.toHaveBeenCalled();
    const big = await read((await service.getResized(stored.filename, 1600))!);
    expect((await sharp(big).metadata()).width).toBe(1600);
    const tiny = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#fff' } }).png().toBuffer();
    const tinyStored = await service.saveBuffer(tiny, 'image/png');
    expect((await sharp(await read((await service.getResized(tinyStored.filename, 960))!)).metadata()).width).toBe(200);
  });
  it('refuses unknown widths, non-photos and missing files', async () => {
    const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#000' } }).jpeg().toBuffer();
    const stored = await service.saveBuffer(photo, 'image/jpeg');
    expect(await service.getResized(stored.filename, 500)).toBeNull();
    expect(await service.getResized('11111111-2222-4333-8444-555555555555.mp4', 480)).toBeNull();
    expect(await service.getResized('11111111-2222-4333-8444-555555555555.jpg', 480)).toBeNull();
    expect(await service.getStream(`${stored.filename.split('.')[0]}.w480.webp`)).toBeNull();
  });
});
