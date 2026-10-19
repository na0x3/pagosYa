import { templateManifest } from '@pagosya/store-templates';
import { rollVariants } from './source-master-dice';

const settings = templateManifest('esencial')!.master!;
const calm = { tone: 'calm', temperature: 'warm', lead: 'photo', exclude: [] as string[] } as const;
const roll = (seed: string, extra: Partial<Parameters<typeof rollVariants>[0]> = {}) => rollVariants({ seed, settings, character: calm, photoCount: 6, sections: [], recent: [], ...extra });

it('the same store always rolls the same', () => expect(roll('s1')).toEqual(roll('s1')));

it('different stores roll differently', () => {
  const rolls = ['a', 'b', 'c', 'd', 'e', 'f'].map(seed => JSON.stringify(roll(seed)));
  expect(new Set(rolls).size).toBe(6);
});

it('never repeats a recent hero + palette + fonts', () => {
  const first = roll('s2');
  const again = roll('s2', { recent: [{ hero: first.variants.hero, palette: first.palette, fonts: first.fonts }] });
  expect([again.variants.hero, again.palette, again.fonts]).not.toEqual([first.variants.hero, first.palette, first.fonts]);
});

it('two stores with the same recent list roll differently', () => {
  const recent = [{ hero: 'full', palette: 'terracotta', fonts: 'classic' }];
  expect(JSON.stringify(roll('x1', { recent }))).not.toBe(JSON.stringify(roll('x2', { recent })));
});

it('respects exclusions', () => {
  for (const seed of 'abcdefghij') expect(roll(seed, { character: { ...calm, exclude: ['type'] } }).variants.hero).not.toBe('type');
});

it('photo-hungry variants need enough photos', () => {
  for (const seed of 'abcdefghijklmnop') {
    const v = roll(seed, { photoCount: 1 }).variants;
    expect(['collage', 'strip']).not.toContain(v.hero);
    expect(v.story).not.toBe('pair');
  }
});

it('keeps the chosen business sections (at most 2, only catalogued ones)', () => {
  expect(roll('s3', { sections: ['process', 'nope', 'faq', 'visit'] }).variants.sections).toEqual(['process', 'faq']);
});

it('a bold character leans to bold palettes', () => {
  const bold = ['ember', 'cobalt', 'citrus', 'ink', 'wine', 'noir'];
  const hits = 'abcdefghijklmnopqrst'.split('').filter(seed => bold.includes(roll(seed, { character: { ...calm, tone: 'bold' } }).palette)).length;
  expect(hits).toBeGreaterThanOrEqual(12);
});

it('over many stores every palette, font pair and hero gets used', () => {
  const seeds = Array.from({ length: 300 }, (_, i) => `store-${i}`);
  const rolls = seeds.map(seed => roll(seed, { character: { ...calm, tone: seed.endsWith('0') ? 'bold' : 'calm', temperature: (['warm', 'cool', 'neutral'] as const)[seed.length % 3] } }));
  expect(new Set(rolls.map(r => r.fonts)).size).toBe(settings.fonts.length);
  expect(new Set(rolls.map(r => r.variants.hero)).size).toBe(10);
  expect(new Set(rolls.map(r => r.palette)).size).toBeGreaterThanOrEqual(14);
});

it('consecutive stores avoid the last stores\' font pairs and the last two palettes (live check 2026-10-19: 4 of 6 stores got «modern»)', () => {
  const recent: Array<{ hero: string; palette: string; fonts: string }> = [];
  for (let i = 0; i < 12; i++) {
    const r = roll(`cmvfhgi${i}00${i}yg6g`, { recent: [...recent] });
    expect(recent.slice(0, 6).map(x => x.fonts)).not.toContain(r.fonts);
    expect(recent.slice(0, 2).map(x => x.palette)).not.toContain(r.palette);
    recent.unshift({ hero: r.variants.hero, palette: r.palette, fonts: r.fonts });
  }
});

it('an over-eager exclusion list still leaves at least half of each part (live check: 4 of 6 stores got the feature grid)', () => {
  const grids = new Set<string>();
  for (const seed of 'abcdefghijklmnopqrst') grids.add(roll(seed, { character: { ...calm, exclude: ['grid4', 'grid3', 'strip', 'list', 'masonry'] } }).variants.grid);
  expect(grids.size).toBeGreaterThanOrEqual(3);
});
