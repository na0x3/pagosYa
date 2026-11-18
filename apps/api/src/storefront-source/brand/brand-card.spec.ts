import { brandCardMetadata, brandCardText, brandDoneText } from './brand-card';
import { BRIEF } from './brand-fixtures';

describe('brand card', () => {
  it('is built from the brief, not from model prose', () => {
    const { brandCard } = brandCardMetadata(BRIEF);
    expect(brandCard.swatches).toEqual([{ role: 'Texto', hex: '#3B1F14' }, { role: 'Principal', hex: '#B4400A' }, { role: 'Acento', hex: '#F2C342' }, { role: 'Secundario', hex: '#7AA62E' }, { role: 'Fondo', hex: '#F8F1E4' }]);
    expect(brandCard.fonts).toEqual([{ role: 'Títulos', family: 'Oswald' }, { role: 'Secundaria', family: 'Fraunces' }, { role: 'Texto', family: 'Instrument Sans' }]);
    expect(brandCard.searched).toBe(false);
  });

  it('says what the identity is and, at the end, what YAPI did', () => {
    expect(brandCardText(BRIEF)).toBe('Esta es la nueva identidad de Calima: una paleta de sol tibio y letra firme y cercana.');
    expect(brandDoneText(BRIEF, 8, true)).toContain('fotografié 8 escenas');
    expect(brandDoneText(BRIEF, 8, true)).toContain('Receta junto al producto');
    expect(brandDoneText(BRIEF, 0, true)).not.toContain('fotografié');
  });
});
