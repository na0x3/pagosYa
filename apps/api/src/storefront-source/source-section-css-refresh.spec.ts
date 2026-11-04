import { templateSourceFiles } from '@pagosya/store-templates';
import { withCurrentSectionCss, withCurrentThemeBlock } from './source-templates';

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
