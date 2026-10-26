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
});
