import { posterSpelledRight, shotList, shotPrompt } from './brand-shoot';
import { BRIEF } from './brand-fixtures';

const products = [{ name: 'Habanero', photo: '/v1/uploads/a.jpg' }, { name: 'Serrano', photo: '/v1/uploads/b.jpg' }, { name: 'Chipotle', photo: '/v1/uploads/c.jpg' }];

describe('brand shoot', () => {
  it('plans the shots in order up to the plan cap', () => {
    expect(shotList(products, null, 2).map(s => s.kind)).toEqual(['hero', 'lifestyle']);
    const eight = shotList(products, '/v1/uploads/logo.png', 8);
    expect(eight.map(s => s.kind)).toEqual(['hero', 'lifestyle', 'poster', 'closeup', 'lifestyle', 'lifestyle', 'flatlay', 'banner']);
    expect(eight[0].references).toEqual(['/v1/uploads/a.jpg', '/v1/uploads/b.jpg', '/v1/uploads/c.jpg']);
    expect(eight[2].references[0]).toBe('/v1/uploads/logo.png');
    expect(eight[4].product).toBe('Serrano');
  });

  it('plans fewer lifestyle shots when there is one product, never an empty reference list', () => {
    const one = shotList([products[0]], null, 8);
    expect(one.every(s => s.references.length > 0)).toBe(true);
    expect(one.filter(s => s.kind === 'lifestyle').length).toBe(1);
  });

  it('keeps the product exact, follows the brief and asks for the name only on a poster with text', () => {
    const [hero, , poster] = shotList(products, null, 8);
    const prompt = shotPrompt(hero, BRIEF.identity, 'Calima', false);
    expect(prompt).toMatch(/identical/i);
    expect(prompt).toContain('luz de tarde');
    expect(prompt).toMatch(/No added text/i);
    expect(shotPrompt(poster, BRIEF.identity, 'Calima', true)).toContain('"CALIMA"');
    expect(shotPrompt(poster, BRIEF.identity, 'Calima', false)).toMatch(/No added text/i);
  });

  it('checks the poster spelling without minding case or accents', () => {
    expect(posterSpelledRight('CALIMA a pocket of hot sun', 'Calima')).toBe(true);
    expect(posterSpelledRight('PENA PICANTE', 'Peña Picante')).toBe(true);
    expect(posterSpelledRight('CALIMMA', 'Calima')).toBe(false);
  });
});
