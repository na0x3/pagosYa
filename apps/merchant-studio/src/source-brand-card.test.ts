import { describe, expect, it } from 'vitest';
import { brandCardOf, renderBrandCard } from './source-brand-card';

const card = { storeName: 'Calima', oneLiner: 'x', swatches: [{ role: 'Texto', hex: '#3B1F14' }, { role: 'Principal', hex: 'red;}' }], fonts: [{ role: 'Títulos', family: 'Oswald' }], references: [{ name: '<b>Heinz</b>', why: 'icónica' }], searched: false };

describe('brand card', () => {
  it('reads the card from the message metadata, dropping colours that are not hex', () => {
    const view = brandCardOf({ id: 'm1', metadata: { brandCard: card } })!;
    expect(view.swatches).toEqual([{ role: 'Texto', hex: '#3B1F14' }]);
    expect(brandCardOf({ id: 'm2', metadata: {} })).toBeNull();
  });

  it('draws swatches with hex, fonts in themselves, escaped reference chips and the no-search note', () => {
    const html = renderBrandCard(brandCardOf({ id: 'm1', metadata: { brandCard: card } })!);
    expect(html).toContain('background:#3B1F14');
    expect(html).toContain("font-family:'Oswald'");
    expect(html).toContain('&lt;b&gt;Heinz&lt;/b&gt;');
    expect(html).toContain('sin búsqueda en vivo');
  });
});
