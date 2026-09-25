// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hostedAssetSource, sourcePreviewDocument } from './source-preview';

const base = 'https://api.pagosya.test/v1/stores/public/tienda/source-site/assets/3-0123456789ab/';
const snapshot = { schemaVersion: 1, brief: {} as any, files: [
  { path: 'index.html', content: '<html><head><link rel="stylesheet" href="styles.css"></head><body><img src="assets/hero.jpg" alt=""><script src="config.js"></script></body></html>' },
  { path: 'styles.css', content: "@font-face{font-family:X;src:url('assets/x.ttf')}body{background:url(assets/hero.jpg)}" },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"hero":"assets/hero.jpg"};' },
  { path: 'assets/hero.jpg', encoding: 'url' as const, content: base + 'assets/hero.jpg' },
  { path: 'assets/x.ttf', encoding: 'url' as const, content: base + 'assets/x.ttf' },
] };

describe('hosted stores load bundled assets as files', () => {
  it('accepts only a local or HTTPS source-site asset directory', () => {
    expect(hostedAssetSource(base)).toBe(base);
    expect(hostedAssetSource('http://localhost:3001/v1/stores/public/t/source-site/assets/1-0123456789ab/')).not.toBeNull();
    for (const bad of ['http://evil.test/v1/stores/public/t/source-site/assets/1-0123456789ab/', 'https://api.test/v1/uploads/', base + '?x=1', 'https://u:p@api.test/v1/stores/public/t/source-site/assets/1-0123456789ab/', 'nonsense'])
      expect(hostedAssetSource(bad)).toBeNull();
  });

  it('emits URLs instead of base64 for images, CSS urls, fonts and config paths, and allows only that directory', () => {
    const html = sourcePreviewDocument(snapshot as any, 'index.html', { hosted: true, assetSources: [base] });
    expect(html).toContain(`src="${base}assets/hero.jpg"`);
    expect(html).not.toMatch(/data:image\/jpeg;base64/);
    expect(html).toContain(`img-src data: blob: ${base}`);
    expect(html).toContain(`font-src data: ${base}`);
    expect(html).toContain(`media-src data: blob: ${base}`);
    // The stylesheet is still inlined as a data: URL; decode it to check its font and background references.
    const css = atob(/href="data:text\/css;base64,([^"]+)"/.exec(html)![1]);
    expect(css).toContain(`url("${base}assets/x.ttf")`);
    expect(css).toContain(`url("${base}assets/hero.jpg")`);
    const config = atob(/src="data:text\/javascript;base64,([^"]+)"/.exec(html)![1]);
    expect(config).toContain(`"${base}assets/hero.jpg"`);
  });

  it('drops a url-encoded file that points outside the allowed asset directory', () => {
    const tampered = structuredClone(snapshot);
    tampered.files[3].content = 'https://evil.test/hero.jpg';
    const html = sourcePreviewDocument(tampered as any, 'index.html', { hosted: true, assetSources: [base] });
    expect(html).not.toContain('evil.test');
  });

  it('keeps Studio previews (base64 files, no asset sources) exactly as data: URLs', () => {
    const studio = { ...snapshot, files: snapshot.files.map(f => f.encoding === 'url' ? { path: f.path, encoding: 'base64' as const, content: btoa('bytes') } : f) };
    const html = sourcePreviewDocument(studio as any, 'index.html', {});
    expect(html).toContain('src="data:image/jpeg;base64,Ynl0ZXM="');
    expect(html).toContain('font-src data:;');
  });
});
