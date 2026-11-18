import { templateSourceFiles } from '@pagosya/store-templates';
import { withCurrentSectionCss, withCurrentThemeBlock, withLibrarySectionCode } from './source-templates';

// 2026-11-02 (Taller Lienzo): a store's section blocks are the platform's; a refill brings each one to the template's current version.
describe('withCurrentSectionCss', () => {
  const data = { path: 'components/store-data.tsx', content: 'export const layout: any[] = [];' };
  const source = templateSourceFiles('esencial').find(file => file.path === 'styles/globals.css')!.content;
  it('replaces an old copy of a block the store carries, and adds none it does not', () => {
    const sheet = { path: 'styles/globals.css', content: ':root{--x:1}\n/* lb:story-overlap */\n.lb-overlap{color:red}\n/* /lb:story-overlap */\n' };
    const [, out] = withCurrentSectionCss([data, sheet]);
    expect(out.content).toContain('/* lb:story-overlap */');
    expect(out.content).not.toContain('.lb-overlap{color:red}');
    expect(out.content).toContain('.lb-overlap{grid-template-columns:1fr}');
    expect(out.content).not.toContain('Taller Lienzo 2026-11-02');
    expect(out.content).not.toContain('/* lb:cover-stage */');
    expect(source).toContain('/* lb:cover-stage */');
    expect(withCurrentSectionCss([data, out])[1]).toBe(out);
  });
  it('adds the blocks of sections its layout uses but its sheet does not carry (Remolino perks-rows, 2026-11-11)', () => {
    const composed = { path: 'components/store-data.tsx', content: 'export const layout: any[] = [{"type":"cover-stage"},{"type":"perks-rows"}];' };
    const sheet = { path: 'styles/globals.css', content: ':root{--x:1}\n/* lb:cover-stage */\n.x{}\n/* /lb:cover-stage */\n' };
    const [, out] = withCurrentSectionCss([composed, sheet]);
    expect(out.content).toContain('/* lb:perks-rows */');
    expect(out.content).toContain('.lb-perks{display:grid');
    expect(out.content).not.toContain('/* lb:story-overlap */');
    expect(withCurrentSectionCss([composed, out])[1]).toBe(out);
  });
  it('leaves a store without section blocks, or without template data, alone', () => {
    const plain = [{ path: 'styles/globals.css', content: '/* lb:story-overlap */x/* /lb:story-overlap */' }];
    expect(withCurrentSectionCss(plain)).toBe(plain);
  });
});

// 2026-11-02 (DooBoo): the store's theme block is brought up to the template's, other themes and the rest untouched.
describe('withCurrentThemeBlock', () => {
  it('takes the template theme block, keeps everything else, and leaves an unknown theme alone', () => {
    const css = ':root{--a:1}\n/* theme:pancita */\n[data-es-theme="pancita"] .lb-products-spotlight .es-eyebrow{background:#2bd1c9;color:#fff}\n/* /theme:pancita */\n.tail{}';
    const out = withCurrentThemeBlock(css, 'pancita');
    expect(out).toContain('background:#2bd1c9;color:#0b3d3a');
    expect(out.startsWith(':root{--a:1}')).toBe(true);
    expect(out.endsWith('.tail{}')).toBe(true);
    expect(withCurrentThemeBlock(out, 'pancita')).toBe(out);
    expect(withCurrentThemeBlock(css, 'nadie')).toBe(css);
    expect(withCurrentThemeBlock(css, 'none')).toBe(css);
  });
});

// Spec 2026-11-09 personalizador: a store built before the section carries an older library.tsx; a layout that uses the section brings
// its renderer in (from the template's own marked block), and nothing else in the file changes.
describe('withLibrarySectionCode', () => {
  const library = 'function ProductsSpotlight() { return null; }\nconst SECTIONS: Record<string, any> = {\n  \'products-spotlight\': ProductsSpotlight, \'product-hero\': ProductHero,\n};\n';
  const files = (layout: string) => [{ path: 'components/store-data.tsx', content: `export const layout: any[] = ${layout};` }, { path: 'components/library.tsx', content: library }];
  it('adds the renderer and its entry when the layout uses the section', () => {
    const out = withLibrarySectionCode(files('[{"type":"product-personalizer","product":"p1","look":"stage"}]'));
    const code = out[1].content;
    expect(code).toContain('function ProductPersonalizer(');
    expect(code).toContain("'products-spotlight': ProductsSpotlight, 'product-personalizer': ProductPersonalizer,");
    expect(code.indexOf('function ProductPersonalizer(')).toBeLessThan(code.indexOf('const SECTIONS'));
    expect(withLibrarySectionCode(out)).toBe(out);
  });
  it('leaves a store whose layout does not use it, or whose file lacks the anchors, alone', () => {
    const plain = files('[{"type":"products-grid"}]');
    expect(withLibrarySectionCode(plain)).toBe(plain);
    const odd = [{ path: 'components/store-data.tsx', content: 'export const layout: any[] = [{"type":"product-personalizer"}];' }, { path: 'components/library.tsx', content: 'export default 1;' }];
    expect(withLibrarySectionCode(odd)).toBe(odd);
  });
});
