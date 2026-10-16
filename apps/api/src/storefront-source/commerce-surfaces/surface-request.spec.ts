import { requestedSurfaceParts, surfacesAfterStage } from './surface-request';

describe('requestedSurfaceParts', () => {
  it('reads the part the merchant named', () => {
    expect(requestedSurfaceParts('haz el carrito más bonito')).toEqual(['cart', 'cartLine']);
    expect(requestedSurfaceParts('cambia las tarjetas de producto')).toEqual(['card']);
    expect(requestedSurfaceParts('mejora la página de producto')).toEqual(['productPage']);
    expect(requestedSurfaceParts('quiero un checkout más elegante')).toEqual(['checkout']);
    expect(requestedSurfaceParts('el aviso al agregar es feo')).toEqual(['added']);
    expect(requestedSurfaceParts('Rediseña el carrito de mi tienda.')).toEqual(['cart', 'cartLine']);
  });
  it('leaves the header cart control and unrelated requests alone (Review Focus 3)', () => {
    expect(requestedSurfaceParts('haz el ícono del carrito más grande')).toEqual([]);
    expect(requestedSurfaceParts('el botón del carrito en el encabezado')).toEqual([]);
    expect(requestedSurfaceParts('cambia el título de la portada')).toEqual([]);
  });
});

const OLD = [{ path: 'commerce-templates.json', content: '{"version":1,"parts":[]}' }];
describe('surfacesAfterStage (Review Focus 5)', () => {
  it('a fresh build carries only what this stage kept, never the previous store’s parts', () => {
    expect(surfacesAfterStage({ previousFiles: OLD, outcome: { report: [], note: 'x', retry: [], failed: 'timeout' }, fresh: true })).toEqual({});
    expect(surfacesAfterStage({ previousFiles: OLD, outcome: null, fresh: true })).toEqual({});
    expect(surfacesAfterStage({ previousFiles: OLD, outcome: { file: 'new', report: [], note: '', retry: [] }, fresh: true })).toEqual({ file: 'new' });
  });
  it('an edit keeps the store’s file unless a part request kept a new one', () => {
    expect(surfacesAfterStage({ previousFiles: OLD, outcome: null, fresh: false })).toEqual({ file: OLD[0].content });
    expect(surfacesAfterStage({ previousFiles: OLD, outcome: { report: [], note: 'x', retry: [], failed: 'timeout' }, fresh: false })).toEqual({ file: OLD[0].content });
    expect(surfacesAfterStage({ previousFiles: OLD, outcome: { file: 'new', report: [], note: '', retry: [] }, fresh: false })).toEqual({ file: 'new' });
  });
});
