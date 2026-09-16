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

  it('never rearranges a live store from a question, negation or hypothetical', () => {
    for (const text of [
      '¿me conviene una página aparte para los productos?',
      '¿qué te parece si pongo todo en secciones?',
      '¿debería usar una pestaña por colección?',
      'no quiero que esté en secciones',
      'antes lo tenía en secciones',
      'si lo pongo en secciones, ¿se ve mejor?',
      'pon una foto en la página de productos',
    ]) {
      expect(catalogArrangementIntent(text)).toBeNull();
    }
  });

  it('lets a genuine full-site redesign reach the compositor even when it also mentions an arrangement word', () => {
    expect(catalogArrangementIntent('rediseña mi tienda completa y ponla en secciones')).toBeNull();
  });
});
