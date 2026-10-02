import { validateNextDesign } from './source-next';
import { nextStoreFiles } from './fixtures/next-store';
import type { SourceDesign } from './source-design';

const design = { selected: 0, concepts: [{ layout: { sections: ['menu'], catalogSection: 'menu' }, composition: { pages: [
  { page: 'index.html', sections: [{ id: 'menu' }] },
  { page: 'galeria.html', sections: [{ id: 'gallery-intro' }, { id: 'gallery-sequence' }] },
] } }] } as unknown as SourceDesign;
const gallery = '<main><section id="gallery-intro"><h1>Galería</h1></section><section id="gallery-sequence"><p>Colección</p></section></main>';

describe('composition validation across authored React pages', () => {
  it.each(['components/page-galeria.tsx', 'components/pages/galeria.tsx'])('validates the actual registered page %s', path => {
    const files = [...nextStoreFiles(), { path, content: `// @pagosya-page\nexport default function Gallery(){return ${gallery};}` }];
    expect(() => validateNextDesign(files, design)).not.toThrow();
  });
  it('still rejects a missing gallery, wrong section order and missing section', () => {
    expect(() => validateNextDesign(nextStoreFiles(), design)).toThrow('galeria.html');
    for (const content of [gallery.replace('gallery-intro', 'wrong'), gallery.replace('gallery-sequence', 'gallery-intro')]) {
      expect(() => validateNextDesign([...nextStoreFiles(), { path: 'components/page-galeria.tsx', content: `export default function Gallery(){return ${content};}` }], design)).toThrow('galeria.html');
    }
  });
});
