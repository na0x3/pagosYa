import { createHash } from 'node:crypto';
import { creativeAssetCatalog, creativeAssetFile, searchCreativeAssets, withCreativeAssets } from './source-creative-assets';

describe('searchCreativeAssets', () => {
  it('finds subjects by Spanish name, plural and accent-free, and by English', () => {
    expect(searchCreativeAssets('helado').map(asset => asset.subject)).toContain('soft-ice-cream');
    expect(searchCreativeAssets('helados').map(asset => asset.subject)).toContain('soft-ice-cream');
    expect(searchCreativeAssets('fresas').map(asset => asset.subject)).toContain('strawberry');
    expect(searchCreativeAssets('corazón').every(asset => asset.subject.includes('heart'))).toBe(true);
    expect(searchCreativeAssets('flores').length).toBeGreaterThan(0);
    expect(searchCreativeAssets('ice cream').map(asset => asset.subject)).toContain('soft-ice-cream');
  });
  it('filters by tone and caps the list', () => {
    expect(searchCreativeAssets('helado', 12, 'store').every(asset => asset.tone === 'store')).toBe(true);
    expect(searchCreativeAssets('helado', 12, 'colour').every(asset => asset.tone === 'colour')).toBe(true);
    expect(searchCreativeAssets('comida').length).toBeLessThanOrEqual(12);
    expect(searchCreativeAssets('helado', 3)).toHaveLength(3);
  });
  it('includes the in-house motif drawings as store-colour art', () => {
    expect(searchCreativeAssets('heladería', 32, 'store').some(asset => asset.family === 'motif-icecream')).toBe(true);
  });
  it('returns nothing for filler words, empty text or unrelated topics', () => {
    expect(searchCreativeAssets('de la con para')).toEqual([]);
    expect(searchCreativeAssets('')).toEqual([]);
    expect(searchCreativeAssets('abogados contratos')).toEqual([]);
  });
  it('treats drawing and style words as no subject, so an unknown subject finds nothing', () => {
    expect(searchCreativeAssets('dibujo de xyzzy')).toEqual([]);
    expect(searchCreativeAssets('ilustración color tienda línea 3d')).toEqual([]);
    expect(searchCreativeAssets('dibujo de dinosaurio', 32, 'store')).toEqual([]);
    expect(searchCreativeAssets('ilustración de unicornio', 32).every(asset => asset.subject === 'unicorn')).toBe(true);
  });
  it('keeps the old rocket query working', () => {
    expect(searchCreativeAssets('rocket dimensional', 1)[0].id).toBe('fluent-3d/rocket');
  });
});

describe('creativeAssetCatalog', () => {
  it('lists each drawing once, even when a pack reuses one file for several placements', () => {
    const paths = creativeAssetCatalog().map(asset => asset.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(creativeAssetCatalog().find(asset => asset.path === 'assets/creative/motif-icecream/button.svg')!.description).toMatch(/botón.*tarjeta.*carrito/);
  });
});

describe('creativeAssetFile', () => {
  it('reads every Fluent file and every motif drawing byte-identical to its record', () => {
    for (const asset of creativeAssetCatalog()) {
      const file = creativeAssetFile(asset);
      const bytes = Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    }
  });
});

describe('withCreativeAssets', () => {
  it('bundles referenced colour, store-colour and motif art with one Fluent licence, and nothing unreferenced', () => {
    const source = { path: 'components/home.tsx', content: '<img src="/assets/creative/fluent-flat/coffee.svg"/><Illustration src="/assets/creative/fluent-mono/soft-ice-cream.svg"/><Illustration src="/assets/creative/motif-icecream/sticker.svg"/>' };
    const bundled = withCreativeAssets([source]);
    expect(bundled.map(file => file.path).sort()).toEqual([source.path, 'assets/creative/fluent-flat/coffee.svg', 'assets/creative/fluent-mono/soft-ice-cream.svg', 'assets/creative/motif-icecream/sticker.svg', 'assets/creative/LICENSE-fluent.txt', 'assets/creative/catalog.json'].sort());
    expect(withCreativeAssets(bundled)).toEqual(bundled);
  });
  it('ignores a misspelt path instead of failing, and adds nothing to a page without art', () => {
    expect(withCreativeAssets([{ path: 'components/home.tsx', content: '<img src="/assets/creative/fluent-flat/ice-creem.svg"/>' }])).toHaveLength(1);
    expect(withCreativeAssets([{ path: 'index.html', content: '<h1>Sin arte</h1>' }])).toHaveLength(1);
  });
});
