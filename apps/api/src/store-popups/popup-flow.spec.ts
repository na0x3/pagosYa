import { renderedSteps, validateFlow } from './popup-flow';

const products = ['p1', 'p2', 'p3'];
const ok = [{ id: 'a', kind: 'offer' }, { id: 'b', kind: 'pick', products: ['p1', 'p2'] }, { id: 'c', kind: 'capture' }, { id: 'd', kind: 'reveal' }, { id: 'e', kind: 'land', to: 'product' }];

describe('popup flow rules', () => {
  it('accepts a sound flow and drops unknown products', () => {
    const result = validateFlow([...ok.slice(0, 1), { id: 'b', kind: 'pick', products: ['p1', 'gone', 'p2'] }, ...ok.slice(2)], products);
    expect('flow' in result && result.flow[1]).toEqual({ id: 'b', kind: 'pick', products: ['p1', 'p2'] });
    expect('flow' in result && renderedSteps(result.flow).map(s => s.kind)).toEqual(['offer', 'pick', 'capture', 'reveal']);
  });

  it('names every broken rule', () => {
    const result = validateFlow([{ id: 'a', kind: 'reveal' }, { id: 'b', kind: 'capture' }, { id: 'c', kind: 'land', to: 'product' }, { id: 'd', kind: 'offer' }], products) as { problems: string[] };
    expect(result.problems).toEqual(expect.arrayContaining([expect.stringMatching(/capture.*antes.*reveal/), expect.stringMatching(/land.*último/)]));
    expect((validateFlow([{ id: 'a', kind: 'offer' }], products) as { problems: string[] }).problems.join()).toMatch(/2 a 6/);
    expect((validateFlow([{ id: 'a', kind: 'game', game: 'scratch' }, { id: 'b', kind: 'game', game: 'wheel' }, { id: 'c', kind: 'capture' }], products) as any).problems.join()).toMatch(/un solo juego/);
  });

  it('refuses product steps for a store with fewer than 2 products, and quiz answers without products', () => {
    expect((validateFlow(ok, ['p1']) as any).problems.join()).toMatch(/al menos 2 productos/);
    const quiz = { id: 'q', kind: 'quiz', questions: [{ id: 'q1', text: '¿Para quién?', answers: [{ id: 'a1', text: 'Para mí', products: [] }, { id: 'a2', text: 'Regalo', products: ['p2'] }] }] };
    expect((validateFlow([quiz, ...ok.slice(2)], products) as any).problems.join()).toMatch(/respuesta sin productos/);
  });
  it('refuses game steps until the runtime plays them inside a design (today\'s games keep their own popup)', () => {
    expect((validateFlow([{ id: 'g', kind: 'game', game: 'scratch' }, ...ok.slice(2)], products) as any).problems.join()).toMatch(/juegos todavía no/);
  });
});
