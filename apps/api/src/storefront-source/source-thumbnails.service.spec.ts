import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** «Tus tiendas» cards (owner 2026-10-26): one picture per store revision, drawn once and kept; never a browser per visit. */
describe('store thumbnails', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'thumbs-')); process.env.SOURCE_THUMBNAIL_DIR = dir; jest.resetModules(); });
  afterEach(() => { delete process.env.SOURCE_THUMBNAIL_DIR; });
  const service = () => {
    const { SourceThumbnailsService } = require('./source-thumbnails.service');
    const projects = { version: jest.fn().mockResolvedValue({ revision: 3, digest: 'abcdef0123456789zz', snapshot: { files: [] } }) };
    const svc = new SourceThumbnailsService(projects as any, {} as any, {} as any);
    return { svc, projects };
  };

  it('serves a picture already drawn for that revision without drawing again', async () => {
    await writeFile(join(dir, 'store-1-3-abcdef0123456789.jpg'), Buffer.from('cached'));
    const { svc } = service();
    const draw = jest.spyOn(svc as any, 'draw');
    expect((await svc.thumbnail('m', 'store-1', 3)).toString()).toBe('cached');
    expect(draw).not.toHaveBeenCalled();
  });

  it('draws a new revision once, even when two cards ask at the same time, and keeps it', async () => {
    const { svc } = service();
    const draw = jest.spyOn(svc as any, 'draw').mockResolvedValue(Buffer.from('fresh'));
    const [a, b] = await Promise.all([svc.thumbnail('m', 'store-1', 3), svc.thumbnail('m', 'store-1', 3)]);
    expect([a.toString(), b.toString()]).toEqual(['fresh', 'fresh']);
    expect(draw).toHaveBeenCalledTimes(1);
    expect((await svc.thumbnail('m', 'store-1', 3)).toString()).toBe('fresh');
    expect(draw).toHaveBeenCalledTimes(1);
  });

  // Spec 2026-11-05 point-at: the picture of a circled area.
  it('clips the circled rect plus 48 px, inside the page, never past 1400 × 1000', () => {
    const { regionClip } = require('./source-thumbnails.service');
    expect(regionClip({ rect: { x: 100, y: 200, width: 300, height: 100 }, width: 1280 })).toEqual({ x: 52, y: 152, width: 396, height: 196 });
    expect(regionClip({ rect: { x: 10, y: 10, width: 3000, height: 3000 }, width: 1280 })).toEqual({ x: 0, y: 0, width: 1280, height: 1000 });
    expect(regionClip({ rect: { x: 1200, y: 0, width: 200, height: 50 }, width: 1280 })).toEqual({ x: 1152, y: 0, width: 128, height: 98 });
  });

  it('draws a circled area at the viewport size of the merchant preview (final review 2026-11-05)', async () => {
    const { svc } = service();
    const page = jest.spyOn(svc as any, 'withStorePage').mockResolvedValue(Buffer.from('png'));
    await svc.region('m', 'store-1', 3, { pageQuery: 'index.html', width: 1024, height: 700, rect: { x: 0, y: 0, width: 90, height: 90 }, points: [0, 0, 90, 0, 90, 90] }).catch(() => undefined);
    expect(page.mock.calls[0][3]).toEqual({ width: 1024, height: 700 });
  });

  it('a circled-area picture does not wait behind store cards being drawn (small fixes 2026-11-05)', async () => {
    const { svc } = service();
    (svc as any).queue = new Promise(() => undefined);
    const page = jest.spyOn(svc as any, 'withStorePage').mockResolvedValue(Buffer.from('png'));
    void svc.region('m', 'store-1', 3, { pageQuery: 'index.html', width: 1024, height: 700, rect: { x: 0, y: 0, width: 90, height: 90 }, points: [0, 0, 90, 0, 90, 90] }).catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(page).toHaveBeenCalled();
  });
});
