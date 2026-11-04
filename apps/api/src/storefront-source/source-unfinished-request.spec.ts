import { continuesRequest, pendingRequestIn, unfinishedNote } from './source-unfinished-request';

it('reads «sigue» and its everyday variants as a request to go on', () => {
  for (const words of ['sigue', 'Sigue por favor', 'continúa con lo que estábamos haciendo', 'dale, termínalo', 'sí, retoma', 'Reintenta', 'termina la tienda', 'go on'])
    expect([words, continuesRequest(words)]).toEqual([words, true]);
  for (const words of ['cambia el color del botón', 'siguiente producto en la portada', 'hazlo más grande el logo y cambia todo el texto del inicio por algo más corto y directo, con otra foto de fondo y un botón verde que diga comprar', ''])
    expect([words, continuesRequest(words)]).toEqual([words, false]);
});
it('keeps the request only until a build is saved', () => {
  const kept = { metadata: { pendingRequest: { instruction: 'x', direct: false } } };
  expect(pendingRequestIn([{ metadata: {} }, kept])).toEqual({ instruction: 'x', direct: false });
  expect(pendingRequestIn([{ metadata: { sourceRevision: 2 } }, kept])).toBeUndefined();
  // Final review 2026-11-04: a newer question before the first build is what «sigue»/«dale» answers, never an older request.
  expect(pendingRequestIn([{ metadata: { intake: { pending: true } } }, kept])).toBeUndefined();
  expect(pendingRequestIn([])).toBeUndefined();
});
it('tells the merchant what stopped and how to go on', () => {
  expect(unfinishedNote('interrupted', true)).toMatch(/se apagó el equipo.*base de la plantilla.*«sigue»/);
  expect(unfinishedNote('YAPI llegó al límite.', false)).toMatch(/^YAPI llegó al límite\. Tu pedido no llegó a terminarse/);
});
it('a newer plan card ends the search: an older kept request never jumps ahead of it', () => {
  const kept = { metadata: { pendingRequest: { instruction: 'x', direct: false } } };
  expect(pendingRequestIn([{ metadata: { plan: { card: [] } } }, kept])).toBeUndefined();
});
