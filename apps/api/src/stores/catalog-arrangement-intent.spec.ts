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

  it('recognizes enclitic-pronoun command forms, not just the bare stem', () => {
    expect(catalogArrangementIntent('muéstrame todo en la portada')).toEqual({ layout: 'all' });
  });

  it('recognizes "página aparte" naming the products either before or after the page phrase', () => {
    expect(catalogArrangementIntent('quiero una página aparte para los productos')).toEqual({ layout: 'page' });
    expect(catalogArrangementIntent('necesito una página aparte para los productos')).toEqual({ layout: 'page' });
  });

  it('recognizes a polite phrasing that still commands the change', () => {
    expect(catalogArrangementIntent('hazlo por secciones por favor')).toEqual({ layout: 'sections' });
  });

  it('does not rearrange the store when the owner is praising the current layout while asking for something else', () => {
    expect(catalogArrangementIntent('me gusta cómo está en secciones pero cambia el color')).toBeNull();
  });

  it('does not rearrange the store when the owner is asking what a term means', () => {
    expect(catalogArrangementIntent('quiero entender qué significa "pestañas por colección"')).toBeNull();
  });

  // Accepted misses (product ruling): these fail closed and are left that
  // way on purpose. Pinned here so nobody "fixes" them into a match.
  it('accepts these known misses rather than risk a false positive', () => {
    for (const text of [
      'en secciones, por favor', // no verb at all — inherent cost of the whitelist design
      'me gustaría que los productos vayan en una página aparte', // soft conditional, same risk family as the hypotheticals we reject
      'organiza los productos por colecciones', // no bare "por colecciones" pattern has ever existed
    ]) {
      expect(catalogArrangementIntent(text)).toBeNull();
    }
  });
});
