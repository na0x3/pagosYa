import { plantillaDefaults, readPlantillaCopy, templateStoreDataFile } from './source-templates';

// Spec 2026-10-20 Plantillas fill §3: a converted template reads every text from `copy` in store-data.
describe('Plantilla copy in store-data', () => {
  it('writes the copy line only when the template has slots, and reads it back', () => {
    const file = templateStoreDataFile({ name: 'Trigo' }, {}, undefined, { home_1: 'Pan de masa madre', home_2: '«Comprar» ya' });
    expect(file.content).toContain('export const copy: Record<string, string> = {"home_1":"Pan de masa madre","home_2":"«Comprar» ya"};');
    expect(readPlantillaCopy([file])).toEqual({ home_1: 'Pan de masa madre', home_2: '«Comprar» ya' });
    const plain = templateStoreDataFile({ name: 'Trigo' }, {});
    expect(plain.content).not.toContain('export const copy');
    expect(readPlantillaCopy([plain])).toEqual({});
  });
  it('takes each slot default from the manifest', () => {
    expect(plantillaDefaults({ copy: [{ key: 'home_1', role: 'headline', default: 'Café', max: 12 }, { key: 'home_2', role: 'cta', default: 'Comprar', max: 12 }] } as any)).toEqual({ home_1: 'Café', home_2: 'Comprar' });
    expect(plantillaDefaults({} as any)).toEqual({});
  });
});
