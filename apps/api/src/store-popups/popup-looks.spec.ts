import { nextPopupLook, pickPopupLook, POPUP_LOOK_IDS, POPUP_LOOK_NAMES, readPopupLook } from './popup-looks';

describe('popup looks', () => {
  it('reads ids and names, with or without accents and case', () => {
    expect(readPopupLook('postal')).toBe('postal');
    expect(readPopupLook('Clásica')).toBe('clasica');
    expect(readPopupLook(' REVISTA ')).toBe('revista');
    expect(readPopupLook('ruleta')).toBeNull();
    expect(readPopupLook(42)).toBeNull();
    expect(POPUP_LOOK_NAMES.etiqueta).toBe('Etiqueta');
  });
  it('picks a stable look per slug, spread over all six, never the one to avoid', () => {
    expect(pickPopupLook('miga-dorada')).toBe(pickPopupLook('miga-dorada'));
    const counts = new Map<string, number>();
    for (let i = 0; i < 600; i++) { const look = pickPopupLook(`tienda-${i}`); counts.set(look, (counts.get(look) ?? 0) + 1); }
    expect(counts.size).toBe(6);
    for (const n of counts.values()) expect(n).toBeGreaterThan(60);
    const usual = pickPopupLook('w9ykv26r');
    expect(pickPopupLook('w9ykv26r', usual)).not.toBe(usual);
    expect(POPUP_LOOK_IDS).toContain(pickPopupLook(undefined as unknown as string));
  });
  it('steps to the next look and wraps, from any start', () => {
    expect(nextPopupLook('clasica')).toBe('portada');
    expect(nextPopupLook('etiqueta')).toBe('clasica');
    expect(POPUP_LOOK_IDS).toContain(nextPopupLook(undefined));
  });
});
