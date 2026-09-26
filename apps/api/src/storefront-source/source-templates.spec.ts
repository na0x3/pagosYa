import * as vm from 'node:vm';
import * as ts from 'typescript';
import { templateManifest, type TemplateManifest } from '@pagosya/store-templates';
import { compileNextPreview } from './source-next';
import { nextStoreFiles } from './fixtures/next-store';
import { fillTemplatePhotos, templateDemoAssets, templateStoreDataFile } from './source-templates';

// These compile real React stores with esbuild; next to the browser contract suite that takes longer than 5 s.
jest.setTimeout(60_000);

const manifest: TemplateManifest = {
  id: 'prueba', name: 'Prueba', category: 'comida', description: 'x', tags: [], sitePurpose: 'shop', order: 1,
  photos: [
    { slot: 'hero', role: 'hero', demo: 'hero.jpg' },
    { slot: 'uno', role: 'product', demo: 'uno.jpg' },
    { slot: 'mesa', role: 'lifestyle', demo: 'mesa.jpg' },
    { slot: 'grano', role: 'detail' },
  ],
};

describe('template photo slots', () => {
  it('fills hero and product slots with each product\'s first photo in catalog order, then lifestyle and detail with the remaining photos', () => {
    const items = [
      { imageUrls: ['https://api.test/v1/uploads/a1.jpg', 'https://api.test/v1/uploads/a2.jpg'] },
      { imageUrls: ['https://api.test/v1/uploads/b1.jpg'] },
      { imageUrls: [] },
    ];
    const { photos, demoSlots } = fillTemplatePhotos(manifest, items);
    expect(photos).toEqual({
      hero: 'https://api.test/v1/uploads/a1.jpg',
      uno: 'https://api.test/v1/uploads/b1.jpg',
      mesa: 'https://api.test/v1/uploads/a2.jpg',
      grano: '',
    });
    expect(demoSlots).toEqual([]);
  });

  it('keeps the demo photo for every slot the store cannot fill, and an empty string for a slot with no demo', () => {
    const { photos, demoSlots } = fillTemplatePhotos(manifest, []);
    expect(photos).toEqual({ hero: 'assets/template-prueba-hero.jpg', uno: 'assets/template-prueba-uno.jpg', mesa: 'assets/template-prueba-mesa.jpg', grano: '' });
    expect(demoSlots).toEqual(['hero', 'uno', 'mesa']);
  });

  it('never uses the same photo twice', () => {
    const { photos } = fillTemplatePhotos(manifest, [{ imageUrls: ['x.jpg'] }, { imageUrls: ['x.jpg', 'y.jpg'] }]);
    expect(Object.values(photos).filter(Boolean)).toEqual(['x.jpg', 'assets/template-prueba-uno.jpg', 'y.jpg']);
  });
});

describe('store-data.tsx', () => {
  it('JSON-encodes the store so a hostile name renders as text', async () => {
    const hostile = 'Café "El <Alto>" {x} `y` ${z} </script>';
    const data = templateStoreDataFile({ name: hostile, tagline: 'Hecho a mano', city: 'La Paz' }, { hero: 'assets/template-prueba-hero.jpg' });
    expect(data.path).toBe('components/store-data.tsx');
    const files = nextStoreFiles();
    const home = files.find(f => f.path === 'components/home.tsx')!;
    home.content = "import { store, photos } from './store-data';\n" + home.content.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/, '<h1$1>{store.name}</h1><img src={photos.hero} alt={store.tagline} />');
    const compiled = await compileNextPreview([...files, data]);
    const js = compiled.find(f => f.path === '_compiled/home.js')!.content;
    // The name is a JS string literal in the bundle (data, escaped by React at render), never markup or a closing tag.
    expect(js).toContain('<\\/script>');
    expect(js).not.toContain('</script>');
    // And the module evaluates back to exactly the merchant's text.
    const module = { exports: {} as any };
    new vm.Script(ts.transpileModule(data.content, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText).runInNewContext({ module, exports: module.exports });
    expect(module.exports.store.name).toBe(hostile);
  });

  it('exports every value as a plain string', () => {
    const data = templateStoreDataFile({ name: 'Tostado' }, { hero: '' });
    expect(data.content).toContain('export const store = {"name":"Tostado","tagline":"","city":""} as const;');
    expect(data.content).toContain('export const photos: Record<string, string> = {"hero":""};');
  });
});

describe('demo assets', () => {
  it('bundles only the demo-filled slots, as base64 files named by template and slot', () => {
    const aurora = templateManifest('aurora')!;
    const assets = templateDemoAssets(aurora, ['hero', 'ritual']);
    expect(assets.map(a => a.path)).toEqual(['assets/template-aurora-hero.jpg', 'assets/template-aurora-ritual.jpg']);
    expect(assets.every(a => a.encoding === 'base64' && a.content.length > 100)).toBe(true);
  });
});
