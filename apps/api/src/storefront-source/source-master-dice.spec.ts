import { templateManifest } from '@pagosya/store-templates';
import { distinctPhotoCount, menuVariant, rollVariants } from './source-master-dice';

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

it('review fix: counts a photo once whatever its URL form', () => {
  expect(distinctPhotoCount(['/v1/uploads/a.jpg', 'http://localhost:3001/v1/uploads/a.jpg', '/v1/uploads/b.jpg', undefined, ''])).toBe(2);
});

it('an exclusion names its part: ruling out compact density leaves compact cards in the roll (live 2026-10-19: no store got compact cards)', () => {
  const cards = new Set<string>(), density = new Set<string>();
  for (const seed of 'abcdefghijklmnopqrstuvwxyz') {
    const r = roll(seed, { character: { ...calm, exclude: ['density:compact'] } });
    cards.add(r.variants.cards); density.add(r.variants.density);
  }
  expect(cards).toContain('compact');
  expect(density).not.toContain('compact');
});

it('a bare id two parts share rules out neither; a bare id one part owns still counts', () => {
  const cards = new Set<string>();
  for (const seed of 'abcdefghijklmnopqrstuvwxyz') {
    const r = roll(seed, { character: { ...calm, exclude: ['compact', 'type'] } });
    cards.add(r.variants.cards);
    expect(r.variants.hero).not.toBe('type');
  }
  expect(cards).toContain('compact');
});

it('card designs and offer layouts are the dice\'s alone: the fill call cannot rule them out (live: 5 of 6 stores got grid offers)', () => {
  const offers = new Set<string>(), cards = new Set<string>();
  for (const seed of 'abcdefghijklmnopqrstuvwxyz') {
    const r = roll(seed, { character: { ...calm, exclude: ['offers:steps', 'offers:rows', 'cards:compact'] } });
    offers.add(r.variants.offers); cards.add(r.variants.cards);
  }
  expect([...offers].sort()).toEqual(['grid', 'rows', 'steps']);
  expect(cards).toContain('compact');
});

it('a fashion store always gets the fashion card and product page; every other part still rolls', () => {
  const fashion = { ...calm, kind: 'fashion' as const };
  const heroes = new Set<string>();
  for (const seed of 'abcdefghij') {
    const rolled = roll(seed, { character: fashion });
    expect([rolled.variants.cards, rolled.variants.pdp]).toEqual(['fashion', 'fashion']);
    heroes.add(rolled.variants.hero);
  }
  expect(heroes.size).toBeGreaterThan(1);
});

it('no other store ever rolls the fashion card or page, whatever the seed or exclusions', () => {
  for (let i = 0; i < 40; i++) {
    const rolled = roll(`seed-${i}`, { character: { ...calm, exclude: ['cards:showcase', 'cards:compact', 'cards:split', 'pdp:gallery-left'] } });
    expect(rolled.variants.cards).not.toBe('fashion');
    expect(rolled.variants.pdp).not.toBe('fashion');
  }
});

/** Dropdown menu spec 2026-10-21: the menu part. */
describe('menu part', () => {
  const { menu: _menu, ...withoutMenuVariants } = settings.variants as Record<string, readonly string[]>;
  const withoutMenu = { ...settings, variants: withoutMenuVariants } as typeof settings;
  it('the catalogue has the menu part', () => expect(settings.variants?.menu).toEqual(['none', 'panel', 'dropdowns']));
  it('a store with fewer than 2 categories rolls none', () => {
    for (const seed of 'abcdefgh') expect(roll(seed, { categoryCount: 1 }).variants.menu).toBe('none');
    expect(roll('z').variants.menu).toBe('none');
  });
  it('fashion stores always get the panel', () => {
    for (const seed of 'abcdefgh') expect(roll(seed, { categoryCount: 0, character: { ...calm, kind: 'fashion' } }).variants.menu).toBe('panel');
  });
  it('other stores with categories roll every value across seeds', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => roll(`s${i}`, { categoryCount: 3 }).variants.menu));
    expect(seen).toEqual(new Set(['none', 'panel', 'dropdowns']));
  });
  it('adding the menu part leaves every other roll as it was', () => {
    for (const seed of 'abcdef') {
      const before = rollVariants({ seed, settings: withoutMenu, character: calm, photoCount: 6, sections: [], recent: [] });
      const after = roll(seed, { categoryCount: 3 });
      const { menu: _rolled, ...rest } = after.variants;
      expect(rest).toEqual(before.variants);
      expect([after.palette, after.fonts]).toEqual([before.palette, before.fonts]);
    }
  });
  it('the fill picks the style but not whether a non-fashion store has a menu', () => {
    expect(menuVariant('panel', 'dropdowns', false)).toBe('dropdowns');
    expect(menuVariant('none', 'dropdowns', false)).toBe('none');
    expect(menuVariant('dropdowns', 'none', false)).toBe('dropdowns');
    expect(menuVariant('panel', 'dropdowns', true)).toBe('dropdowns');
    expect(menuVariant('panel', 'none', true)).toBe('panel');
    expect(menuVariant(undefined, 'panel', false)).toBeUndefined();
  });
});

/** Spec 2026-10-21 sort & filter styles: the filters part. */
describe('filters part', () => {
  it('the catalogue has the filters part', () => expect(settings.variants?.filters).toEqual(['bar', 'chips', 'sidebar']));
  it('fashion stores with 2+ categories get chips', () => {
    for (const seed of 'abcdefgh') expect(roll(seed, { categoryCount: 2, character: { ...calm, kind: 'fashion' } }).variants.filters).toBe('chips');
  });
  it('other stores roll every style across seeds, from their own seed', () => {
    expect(new Set(Array.from({ length: 40 }, (_, i) => roll(`s${i}`, { categoryCount: 3 }).variants.filters))).toEqual(new Set(['bar', 'chips', 'sidebar']));
    const { filters: _f, ...variants } = settings.variants as Record<string, readonly string[]>;
    const before = rollVariants({ seed: 'x', settings: { ...settings, variants } as typeof settings, character: calm, photoCount: 6, sections: [], recent: [], categoryCount: 3 });
    const { filters: _rolled, ...rest } = roll('x', { categoryCount: 3 }).variants;
    expect(rest).toEqual(before.variants);
  });
});

/** John Smedley sections (spec 2026-10-21): the feature part. */
describe('feature part', () => {
  it('the catalogue has the feature part and the new looks', () => {
    expect(settings.variants?.feature).toEqual(['duo', 'explore', 'capsule', 'origin', 'palette']);
    expect(settings.variants?.grid).toContain('side-title');
    expect(settings.variants?.header).toContain('boxed');
    expect(settings.variants?.button).toContain('dashed');
    expect(settings.variants?.footer).toContain('column');
  });
  it('rolls 0–2 eligible sections as a comma list, from its own seed', () => {
    const rolled = Array.from({ length: 40 }, (_, i) => roll(`s${i}`, { featureEligible: ['duo', 'origin'] }).variants.feature);
    for (const value of rolled) expect(value.split(',').filter(Boolean).every(id => ['duo', 'origin'].includes(id))).toBe(true);
    expect(new Set(rolled.map(value => value.split(',').filter(Boolean).length))).toEqual(new Set([0, 1, 2]));
    const { feature: _f, ...variants } = settings.variants as Record<string, readonly string[]>;
    const before = rollVariants({ seed: 'x', settings: { ...settings, variants } as typeof settings, character: calm, photoCount: 6, sections: [], recent: [] });
    const { feature: _rolled, ...rest } = roll('x', { featureEligible: ['duo'] }).variants;
    expect(rest).toEqual(before.variants);
  });
  it('nothing eligible rolls nothing', () => {
    expect(roll('z', { featureEligible: [] }).variants.feature).toBe('');
    expect(roll('z').variants.feature).toBeUndefined();
  });
});
