import { carryCommerceTemplates, requestedSurfaceParts, surfacesAfterStage } from './surface-request';

describe('requestedSurfaceParts', () => {
  it('reads the part the merchant named', () => {
    expect(requestedSurfaceParts('haz el carrito más bonito')).toEqual(['cart', 'cartLine']);
    expect(requestedSurfaceParts('cambia las tarjetas de producto')).toEqual(['card']);
    expect(requestedSurfaceParts('mejora la página de producto')).toEqual(['productPage']);
    expect(requestedSurfaceParts('quiero un checkout más elegante')).toEqual(['checkout']);
    expect(requestedSurfaceParts('el aviso al agregar es feo')).toEqual(['added']);
    expect(requestedSurfaceParts('Rediseña el carrito de mi tienda.')).toEqual(['cart', 'cartLine']);
  });
  it('needs a design request about the part itself, never a passing mention (review I6)', () => {
    expect(requestedSurfaceParts('haz el carrito como una taza')).toEqual([]);
    expect(requestedSurfaceParts('cambia el ícono de la canasta')).toEqual([]);
    expect(requestedSurfaceParts('agrega info sobre el pago por QR en la portada')).toEqual([]);
    expect(requestedSurfaceParts('agrega la ficha técnica de cada mueble')).toEqual([]);
    expect(requestedSurfaceParts('pon el botón de WhatsApp junto al carrito')).toEqual([]);
    expect(requestedSurfaceParts('la canasta se ve fea, mejórala')).toEqual(['cart', 'cartLine']);
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

describe('carryCommerceTemplates (review C2: the Sep-5 N+1 save dropped the file live on 2026-10-15)', () => {
  const saved = [{ path: 'index.html', content: 'n' }, { path: 'commerce-templates.json', content: '{"version":1,"parts":[]}' }];
  it('keeps revision N’s templates on the review’s save', () => {
    expect(carryCommerceTemplates(saved, [{ path: 'index.html', content: 'n+1' }])).toEqual([{ path: 'index.html', content: 'n+1' }, saved[1]]);
  });
  it('never duplicates one the review already carries, and adds nothing when N had none', () => {
    const files = [{ path: 'commerce-templates.json', content: 'x' }];
    expect(carryCommerceTemplates(saved, files)).toEqual(files);
    expect(carryCommerceTemplates([{ path: 'index.html', content: 'n' }], [{ path: 'index.html', content: 'n+1' }])).toEqual([{ path: 'index.html', content: 'n+1' }]);
  });
});
