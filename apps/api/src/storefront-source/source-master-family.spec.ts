import { familyFor, familyLook, familyVariants } from './source-master-family';

// Owner 2026-10-27: template families from the merchant's words, the business and a store-seeded pick.
describe('template families', () => {
  const base = { words: '', business: '', animated: false, fashion: false, productCount: 5, seed: 's1' };
  it('takes the family the merchant names', () => {
    expect(familyFor({ ...base, words: 'Quiero que se vea como una revista de moda, estilo Vogue' })).toBe('revista');
    expect(familyFor({ ...base, words: 'algo pop, con stickers' })).toBe('pop');
    expect(familyFor({ ...base, words: 'que la tienda sea como un menú de cafetería' })).toBe('menu');
    expect(familyFor({ ...base, words: 'quiero un menú desplegable en el encabezado', business: 'Soda prebiótica', animated: true })).not.toBe('menu');
  });
  it('picks among the families that fit the business, the same pick for the same store', () => {
    expect(['boutique', 'revista']).toContain(familyFor({ ...base, fashion: true }));
    expect(['pop', 'menu']).toContain(familyFor({ ...base, business: 'Antojo Café', animated: true }));
    expect(['heroe', 'pop']).toContain(familyFor({ ...base, business: 'Soda prebiótica', animated: true }));
    expect(familyFor({ ...base, fashion: true })).toBe(familyFor({ ...base, fashion: true }));
    const picks = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(seed => familyFor({ ...base, fashion: true, seed })));
    expect(picks.size).toBe(2);
  });
  it('fixes the family\'s parts and keeps an allowed roll', () => {
    const catalogue = { family: ['esencial', 'pop', 'revista'], outline: ['none', 'chunky'], bands: ['blocks', 'calm'], grid: ['grid3', 'grid4', 'list'], button: ['pill', 'underline'], corners: ['round'] };
    expect(familyVariants('pop', { grid: 'grid4' }, 's1', catalogue)).toEqual({ family: 'pop', outline: 'chunky', bands: 'blocks', button: 'pill', corners: 'round' });
    expect(familyVariants('pop', { grid: 'list' }, 's1', catalogue).grid).toMatch(/^grid[34]$/);
  });
  it('gives a magazine a light page and an editorial font', () => {
    const settings = { palettes: [{ id: 'noir', paper: '#111111' }, { id: 'linen', paper: '#f7f2ea' }], fonts: [{ id: 'poster' }, { id: 'editorial' }] };
    expect(familyLook('revista', { palette: 'noir', fonts: 'poster' }, 's1', settings)).toEqual({ palette: 'linen', fonts: 'editorial' });
    expect(familyLook('revista', { palette: 'linen', fonts: 'editorial' }, 's1', settings)).toEqual({});
  });
});
