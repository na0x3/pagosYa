import { outsideFocus, pointFocus } from './source-point-focus';

/** Point YAPI at a part of the page (spec 2026-11-05 point-at): what the quick template edit is told the merchant pointed at. */
const area = { points: [0, 0, 1, 0, 1, 1], rect: { x: 0, y: 0, width: 90, height: 90 }, sections: [{ page: 'home', at: 2, label: 'A' }, { page: 'home', at: 3, label: 'B' }], texts: ['Hola'], photos: ['/v1/uploads/a.jpg'], parts: ['menu'], width: 1280, pageQuery: 'index.html' } as never;

describe('pointFocus', () => {
  it('a clicked template section', () => {
    expect(pointFocus({ instruction: 'hazla más corta', selection: { sectionId: 'lb-1', at: 1, page: 'about' } }))
      .toEqual({ pagina: 'about', secciones: [1], textos: [], fotos: [], partes: [] });
  });
  it('a circle', () => {
    expect(pointFocus({ instruction: 'cambia esta foto', selection: { sectionId: 'lb-2', area } }))
      .toEqual({ pagina: 'home', secciones: [2, 3], textos: ['Hola'], fotos: ['/v1/uploads/a.jpg'], partes: ['menu'] });
  });
  it('what the merchant is looking at, only with «esto», «aquí»…', () => {
    expect(pointFocus({ instruction: 'agrega una pregunta aquí sobre arreglos', viewing: { page: 'faq', at: 2 } }))
      .toEqual({ pagina: 'faq', secciones: [], textos: [], fotos: [], partes: [], mirando: { pagina: 'faq', at: 2 } });
    expect(pointFocus({ instruction: 'agrega una pregunta sobre arreglos', viewing: { page: 'faq', at: 2 } })).toBeNull();
    expect(pointFocus({ instruction: 'la tienda está linda', viewing: { page: 'faq', at: 2 } })).toBeNull();
  });
  it('a classic store section (no address) is not a focus', () => {
    expect(pointFocus({ instruction: 'hazla más corta', selection: { sectionId: 'hero' } })).toBeNull();
  });
});

it('outsideFocus names ops on the focused page outside its sections', () => {
  const focus = pointFocus({ instruction: 'x', selection: { sectionId: 'lb-1', at: 1, page: 'home' } });
  expect(outsideFocus([{ at: 1 }, { at: 4 }, { page: 'about', at: 0 }], focus)).toEqual(['home:4']);
  expect(outsideFocus([{ at: 4 }], null)).toEqual([]);
});

it('a section on a page YAPI made is a focus on that page (spec 2026-11-05 creates anything)', () => {
  expect(pointFocus({ instruction: 'agrega un paso aquí', selection: { sectionId: 'lb-1', at: 1, page: 'novias' as never } })).toMatchObject({ pagina: 'novias', secciones: [1] });
});
