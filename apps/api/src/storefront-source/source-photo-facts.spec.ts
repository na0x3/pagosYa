import { derivePhotoFacts, imageAspect, imageDimensions, normalizeSourcePhotoFacts, resolvePhotoShot } from './source-photo-facts';

const png = (width: number, height: number) => {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  return bytes;
};
const jpeg = (width: number, height: number) => {
  const bytes = Buffer.alloc(22);
  bytes.writeUInt16BE(0xffd8, 0);
  bytes.writeUInt16BE(0xffe0, 2); bytes.writeUInt16BE(6, 4); // APP0 of length 6, skipped
  bytes.writeUInt16BE(0xffc0, 10); bytes.writeUInt16BE(11, 12); bytes.writeUInt8(8, 14);
  bytes.writeUInt16BE(height, 15); bytes.writeUInt16BE(width, 17);
  return bytes;
};

it('reads aspect out of image headers without decoding pixels', () => {
  expect(imageDimensions(png(1024, 1536))).toEqual({ width: 1024, height: 1536 });
  expect(imageDimensions(jpeg(736, 1104))).toEqual({ width: 736, height: 1104 });
  expect(imageAspect(png(1024, 1536))).toBe(0.667);
  expect(imageAspect(jpeg(1536, 1024))).toBe(1.5);
  expect(imageAspect(jpeg(1024, 1024))).toBe(1);
});
it('returns no aspect rather than a wrong one for bytes it cannot read', () => {
  expect(imageAspect(Buffer.from('not an image'))).toBeUndefined();
  expect(imageAspect(png(0, 100))).toBeUndefined();
  expect(imageAspect(Buffer.alloc(0))).toBeUndefined();
});

it('keeps only well-formed photo facts and drops the rest', () => {
  expect(normalizeSourcePhotoFacts({ shot: 'scene', productKey: 'prod_1', dominant: ['#C8613F', 'red', '#0a0b0c'], backdropHex: '#FFFDF7', aspect: 0.667 }))
    .toEqual({ shot: 'scene', productKey: 'prod_1', dominant: ['#c8613f', '#0a0b0c'], backdropHex: '#fffdf7', aspect: 0.667 });
  expect(normalizeSourcePhotoFacts({ shot: 'sculpture', dominant: 'blue', backdropHex: '#xyzxyz', aspect: 'wide' })).toBeUndefined();
  expect(normalizeSourcePhotoFacts(undefined)).toBeUndefined();
  expect(normalizeSourcePhotoFacts({ aspect: 1.25 })).toEqual({ aspect: 1.25 });
});
it('caps the dominant list and the product key so a manifest cannot grow without bound', () => {
  const facts = normalizeSourcePhotoFacts({ dominant: Array.from({ length: 12 }, (_, i) => `#0000${i.toString(16)}${i.toString(16)}`), productKey: 'p'.repeat(200) });
  expect(facts!.dominant).toHaveLength(4);
  expect(facts!.productKey).toHaveLength(64);
});

it('reads the shot from upload lineage, because a scene is a derivative of its packshot', () => {
  expect(resolvePhotoShot({ kind: 'AI_DERIVED', hasParent: true })).toBe('scene');
  expect(resolvePhotoShot({ kind: 'ORIGINAL', hasParent: false, isProductImage: true })).toBe('packshot');
});
it('falls back to backdrop uniformity only when lineage says nothing', () => {
  expect(resolvePhotoShot({ kind: 'ORIGINAL', hasParent: false, uniformity: 0.96 })).toBe('packshot');
  expect(resolvePhotoShot({ kind: 'ORIGINAL', hasParent: false, uniformity: 0.2 })).toBe('scene');
  expect(resolvePhotoShot({ kind: 'ORIGINAL', hasParent: false })).toBeUndefined();
});
it('never lets a uniform backdrop override a known derivative', () => {
  expect(resolvePhotoShot({ kind: 'AI_DERIVED', hasParent: true, uniformity: 0.99 })).toBe('scene');
});

const cushion = Buffer.alloc(0);
it('ties a generated scene to the product its packshot belongs to', () => {
  const facts = derivePhotoFacts({
    assets: [{ url: '/v1/uploads/pack.jpg', path: 'assets/image-aaa.jpg', bytes: cushion }, { url: '/v1/uploads/scene.jpg', path: 'assets/image-bbb.jpg', bytes: cushion }],
    lineage: new Map([['/v1/uploads/pack.jpg', { kind: 'ORIGINAL', parentUrl: null }], ['/v1/uploads/scene.jpg', { kind: 'AI_DERIVED', parentUrl: '/v1/uploads/pack.jpg' }]]),
    productImages: [{ id: 'prod_1', images: ['assets/image-aaa.jpg'] }],
    samples: new Map([['/v1/uploads/scene.jpg', { dominant: ['#a3442b'], backdropHex: '#b99e85', uniformity: 0.33 }]]),
  });
  expect(facts['/v1/uploads/pack.jpg']).toEqual({ shot: 'packshot', productKey: 'prod_1' });
  expect(facts['/v1/uploads/scene.jpg']).toEqual({ shot: 'scene', productKey: 'prod_1', dominant: ['#a3442b'], backdropHex: '#b99e85' });
});
it('still keys a scene to its product when the packshot itself was never bundled', () => {
  const facts = derivePhotoFacts({
    assets: [{ url: '/v1/uploads/scene.jpg', path: 'assets/image-bbb.jpg', bytes: cushion }],
    lineage: new Map([['/v1/uploads/scene.jpg', { kind: 'AI_DERIVED', parentUrl: '/v1/uploads/pack.jpg' }]]),
    productImages: [{ id: 'prod_1', images: ['https://api.test/v1/uploads/pack.jpg'] }],
    samples: new Map(),
  });
  expect(facts['/v1/uploads/scene.jpg']).toEqual({ shot: 'scene', productKey: 'prod_1' });
});
it('records nothing at all for an asset it could not learn anything about', () => {
  const facts = derivePhotoFacts({ assets: [{ url: '/v1/uploads/x.jpg', path: 'assets/x.jpg', bytes: cushion }], lineage: new Map(), productImages: [], samples: new Map() });
  expect(facts['/v1/uploads/x.jpg']).toBeUndefined();
});
it('leaves uniformity out of the manifest, since it is evidence for the shot and not a fact about the photo', () => {
  const facts = derivePhotoFacts({
    assets: [{ url: '/v1/uploads/p.jpg', path: 'assets/p.jpg', bytes: cushion }], lineage: new Map(), productImages: [],
    samples: new Map([['/v1/uploads/p.jpg', { dominant: ['#d9d5d2'], backdropHex: '#d9d5d2', uniformity: 1 }]]),
  });
  expect(facts['/v1/uploads/p.jpg']).toEqual({ shot: 'packshot', dominant: ['#d9d5d2'], backdropHex: '#d9d5d2' });
});
