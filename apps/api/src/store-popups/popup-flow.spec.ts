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

describe('flow shape per moment (spec 2026-11-21 §5)', () => {
  const rescue = [{ id: 'k', kind: 'cart' }, { id: 'c', kind: 'capture' }, { id: 'r', kind: 'reveal' }, { id: 'm', kind: 'remind' }, { id: 'l', kind: 'land', to: 'checkout' }];
  it('accepts a rescue flow: the cart first, both branches, checkout last', () => {
    const result = validateFlow(rescue, products, 'rescue');
    expect('flow' in result && result.flow.map(s => s.kind)).toEqual(['cart', 'capture', 'reveal', 'remind', 'land']);
    expect('flow' in result && result.flow[4]).toEqual({ id: 'l', kind: 'land', to: 'checkout' });
  });
  it('names what a rescue flow misses', () => {
    const problems = (validateFlow([rescue[1], rescue[2], rescue[4]], products, 'rescue') as { problems: string[] }).problems.join(' ');
    expect(problems).toMatch(/cart va primero/);
    expect(problems).toMatch(/remind/);
  });
  it('accepts an interest flow that starts with the viewed product, with no fixed products', () => {
    const flow = [{ id: 'p', kind: 'pick', source: 'context', products: [] }, rescue[1], rescue[2], rescue[3], { id: 'l', kind: 'land', to: 'product' }];
    const result = validateFlow(flow, products, 'interest');
    expect('flow' in result && result.flow[0]).toEqual({ id: 'p', kind: 'pick', products: [], source: 'context' });
  });
  it('a return flow has no contact step and picks the favourite or the newest', () => {
    expect('flow' in validateFlow([{ id: 'p', kind: 'pick', source: 'favourite', products: [] }, { id: 'm', kind: 'remind' }, { id: 'l', kind: 'land', to: 'product' }], products, 'return')).toBe(true);
    const problems = (validateFlow([{ id: 'p', kind: 'pick', source: 'new', products: [] }, { id: 'c', kind: 'capture' }], products, 'return') as { problems: string[] }).problems.join(' ');
    expect(problems).toMatch(/regreso va sin capture/);
  });
  it('keeps the welcome rules unchanged when no moment is given', () => {
    expect('flow' in validateFlow(ok, products)).toBe(true);
    expect((validateFlow([{ id: 'a', kind: 'cart' }, { id: 'c', kind: 'capture' }], products) as { problems: string[] }).problems.join(' ')).toMatch(/cart y remind son de los popups de carrito/);
  });
});
