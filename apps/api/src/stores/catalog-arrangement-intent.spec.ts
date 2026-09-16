import { catalogArrangementIntent } from './catalog-arrangement-intent';

describe('catalogArrangementIntent', () => {
  it('recognizes each arrangement', () => {
    expect(catalogArrangementIntent('ponlo en secciones')).toEqual({ layout: 'sections' });
    expect(catalogArrangementIntent('quiero una pestaña por colección')).toEqual({ layout: 'tabs' });
    expect(catalogArrangementIntent('pon los productos en una página aparte')).toEqual({ layout: 'page' });
    expect(catalogArrangementIntent('muestra todo en la portada')).toEqual({ layout: 'all' });
  });

  it('ignores anything else', () => {
    for (const text of ['cambia el color del botón', 'crea una sección de historia', 'rehaz mi tienda']) {
      expect(catalogArrangementIntent(text)).toBeNull();
    }
  });
});
