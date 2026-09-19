import { createHash } from 'node:crypto';
import { creativeAssetCatalog, creativeAssetFile, searchCreativeAssets, withCreativeAssets } from './source-creative-assets';

it('finds subject and style matches in Spanish and English without forcing unrelated stickers', () => {
  expect(searchCreativeAssets('cafetería panadería').map(asset => asset.id)).toEqual(expect.arrayContaining(['fluent-flat/coffee', 'fluent-3d/coffee', 'fluent-flat/bread']));
  expect(searchCreativeAssets('rocket dimensional', 1)[0].id).toBe('fluent-3d/rocket');
  expect(searchCreativeAssets('abogados contratos')).toEqual([]);
});

it('keeps every downloaded artwork byte-identical to its provenance record', () => {
  const assets = creativeAssetCatalog();
  expect(assets).toHaveLength(32);
  for (const asset of assets) {
    const file = creativeAssetFile(asset);
    const bytes = Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');
    expect(bytes.length).toBe(asset.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    expect(asset.license).toBe('MIT');
  }
});

it('bundles selected artwork and licenses in portable snapshots, retaining existing bytes on edits', () => {
  const source = { path: 'components/home.tsx', content: '<img src="/assets/creative/fluent-flat/coffee.svg"/><img src="/assets/creative/fluent-3d/rocket.png"/>' };
  const bundled = withCreativeAssets([source]);
  expect(bundled.map(file => file.path)).toEqual([source.path, 'assets/creative/fluent-flat/coffee.svg', 'assets/creative/fluent-3d/rocket.png', 'assets/creative/LICENSE-fluent.txt', 'assets/creative/catalog.json']);
  expect(withCreativeAssets(bundled)).toEqual(bundled);
  expect(withCreativeAssets([{path: 'index.html', content: '<h1>No artwork requested</h1>'}])).toHaveLength(1);
});
