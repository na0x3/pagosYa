import { sourceAssetInventory, withSourceAssets, SOURCE_ASSET_MANIFEST } from './source-asset-library';
import { SourceAssetsController } from './source-assets.controller';

it('bundles only referenced authentic icons and includes their license', async () => {
  const files = await withSourceAssets([{ path: 'components/home.tsx', content: '<img src="/assets/icons/shopping-bag.svg" />' }]);
  expect(files.map(f => f.path)).toEqual(expect.arrayContaining(['assets/icons/shopping-bag.svg', 'assets/icons/LICENSE.txt', SOURCE_ASSET_MANIFEST]));
  expect(files.some(f => f.path === 'assets/icons/coffee.svg')).toBe(false);
  expect(files.find(f => f.path.endsWith('shopping-bag.svg'))?.content).toContain('viewBox="0 0 24 24"');
});
it('preserves confirmed roles on text-only revisions and ignores stale manifest entries', async () => {
  const photo = { path: 'assets/photo.png', content: 'aGVsbG8=', encoding: 'base64' as const };
  const first = await withSourceAssets([photo], [], [{ path: photo.path, original: '/v1/uploads/a.png' }], [{ url: '/v1/uploads/a.png', role: 'reference', description: 'Layout reference, not product photography' }]);
  const next = await withSourceAssets([photo, { path: 'components/home.tsx', content: '<img src="/assets/photo.png" />' }], first);
  expect(sourceAssetInventory(next)).toEqual([expect.objectContaining({ path: photo.path, role: 'reference', references: ['components/home.tsx'] })]);
  expect(sourceAssetInventory(first.filter(f => f.path !== photo.path))).toEqual([]);
});
it('saves role changes as a revision without changing image bytes or authored code', async () => {
  const snapshot = { brief: {}, files: [{ path: 'assets/photo.png', content: 'aGVsbG8=', encoding: 'base64' }, { path: 'index.html', content: '<h1>Original</h1>' }] };
  const projects: any = { current: jest.fn().mockResolvedValue({ revision: 4 }), version: jest.fn().mockResolvedValue({ snapshot }), save: jest.fn() };
  const controller = new SourceAssetsController(projects, {} as any);
  await controller.roles({ id: 'm' }, 's', { revision: 4, assets: [{ path: 'assets/photo.png', role: 'background', description: 'Main background' }] });
  const saved = projects.save.mock.calls[0][2];
  expect(saved.files.slice(0, 2)).toEqual(snapshot.files);
  expect(sourceAssetInventory(saved.files)[0].role).toBe('background');
  projects.current.mockResolvedValue({ revision: 5 });
  await expect(controller.roles({ id: 'm' }, 's', { revision: 4, assets: [] })).rejects.toThrow('cambió');
  expect(projects.save).toHaveBeenCalledTimes(1);
});
it('rejects invented asset paths before saving', async () => {
  const projects: any = { current: jest.fn().mockResolvedValue({ revision: 1 }), version: jest.fn().mockResolvedValue({ snapshot: { files: [] } }), save: jest.fn() };
  const controller = new SourceAssetsController(projects, {} as any);
  await expect(controller.roles({ id: 'm' }, 's', { revision: 1, assets: [{ path: 'assets/another-merchant.png', role: 'logo', description: '' }] })).rejects.toThrow('incluidos');
  expect(projects.save).not.toHaveBeenCalled();
});

 it('keeps video roles and inventory references across revisions', async () => {
  const video = { path: 'assets/clip.mp4', content: 'AAAAAGZ0eXBpc29t', encoding: 'base64' as const };
  const files = [video, { path: 'index.html', content: '<video src="assets/clip.mp4" controls></video>' }];
  const saved = await withSourceAssets(files, [], [{ original: '/v1/uploads/clip.mp4', path: video.path }], [{ url: '/v1/uploads/clip.mp4', role: 'background', description: 'Video de portada' }]);
  const next = await withSourceAssets(files, saved);
  expect(sourceAssetInventory(next)).toEqual([expect.objectContaining({ path: video.path, kind: 'video', role: 'background', description: 'Video de portada', references: ['index.html'] })]);
 });
