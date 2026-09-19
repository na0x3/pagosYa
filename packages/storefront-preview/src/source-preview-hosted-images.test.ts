// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hostedCatalogImages, hostedImageUrls } from './source-preview-media';
import { sourcePreviewDocument, uploadImageSource } from './source-preview';

const upload = '/v1/uploads/11111111-2222-4333-8444-555555555555.jpg';
describe('hosted storefront images load lazily from the platform upload directory only', () => {
  it('accepts only an HTTPS (or local) uploads directory as an image source', () => {
    expect(uploadImageSource('https://api.pagosya.test/v1/uploads/')).toBe('https://api.pagosya.test/v1/uploads/');
    expect(uploadImageSource('http://localhost:3001/v1/uploads/')).toBe('http://localhost:3001/v1/uploads/');
    for (const bad of ['http://evil.test/v1/uploads/', 'https://api.test/v1/', 'https://u:p@api.test/v1/uploads/', 'https://api.test/v1/uploads/?x=1', 'nonsense']) expect(uploadImageSource(bad)).toBeNull();
  });
  it('rewrites catalog photos to absolute upload URLs and drops anything else', () => {
    const { rewrite, imageSource } = hostedCatalogImages('https://api.pagosya.test/v1');
    const data = { items: [{ imageUrls: [upload, 'https://evil.test/x.jpg'], variants: [{ imageUrl: upload }], extras: [{ imageUrl: 'javascript:alert(1)' }] }] };
    const out = rewrite(data) as any;
    expect(imageSource).toBe('https://api.pagosya.test/v1/uploads/');
    expect(out.items[0].imageUrls).toEqual(['https://api.pagosya.test/v1/uploads/11111111-2222-4333-8444-555555555555.jpg', '']);
    expect(out.items[0].variants[0].imageUrl).toBe(out.items[0].imageUrls[0]);
    expect(out.items[0].extras[0].imageUrl).toBe('');
    expect(data.items[0].imageUrls[0]).toBe(upload);
  });
  it('allows the upload directory in the sandbox policy and keeps matching <img> sources, without any network fetch', () => {
    const config = { data: { items: [{ imageUrls: [upload] }] } };
    const { snapshot, imageSource } = hostedImageUrls('https://api.pagosya.test/v1')({ files: [
      { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};` },
      { path: 'index.html', content: '<html><head></head><body><img src="https://api.pagosya.test/v1/uploads/a.jpg" alt="a"><img src="https://evil.test/b.jpg" alt="b"><script src="config.js"></script></body></html>' },
    ] } as any);
    expect(snapshot.files[0].content).toContain('https://api.pagosya.test/v1/uploads/11111111');
    const html = sourcePreviewDocument(snapshot, 'index.html', { hosted: true, imageSources: [imageSource, 'https://evil.test/'] });
    expect(html).toContain('img-src data: blob: https://api.pagosya.test/v1/uploads/;');
    expect(html).not.toContain('evil.test/;');
    expect(html).toContain('src="https://api.pagosya.test/v1/uploads/a.jpg"');
    expect(html).not.toContain('src="https://evil.test/b.jpg"');
    expect(html).toContain('http-equiv="x-dns-prefetch-control" content="off"');
  });
});
