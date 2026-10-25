import { templateManifest } from '@pagosya/store-templates';
import { distinctPhotoCount, esencialDiceSettings, menuVariant, rollStarterDice, rollVariants } from './source-master-dice';

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

it('keeps the chosen business sections (at most 4 since 2026-10-24, only catalogued ones)', () => {
  expect(roll('s3', { sections: ['process', 'nope', 'faq', 'visit'] }).variants.sections).toEqual(['process', 'faq', 'visit']);
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
  // Every cover except the two multi-photo ones (collage, strip), which need the merchant to ask (owner 2026-10-23), and the
  // text-only one, which a store with photos never gets (owner 2026-10-24).
  expect(new Set(rolls.map(r => r.variants.hero)).size).toBe(7);
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

// Owner 2026-10-22: «clients cant see product and price at same time» — no roll gives a full-screen photo before name, price and buy.
it('never rolls a photo-first product page', () => {
  for (let i = 0; i < 200; i++) expect(['stacked', 'editorial']).not.toContain(roll(`pdp-${i}`).variants.pdp);
});

// Owner 2026-10-23: one photo at most on the cover; more only when the merchant asks.
it('never rolls a multi-photo cover unless the merchant asked for more photos', () => {
  const heroes = Array.from({ length: 60 }, (_, i) => roll(`seed-${i}`, { photoCount: 12 }).variants.hero);
  expect(heroes.filter(hero => hero === 'collage' || hero === 'strip')).toEqual([]);
  const asked = Array.from({ length: 60 }, (_, i) => roll(`seed-${i}`, { photoCount: 12, photoGroups: true }).variants.hero);
  expect(asked.some(hero => hero === 'collage' || hero === 'strip')).toBe(true);
});

describe('starter dice (spec 2026-10-24-starter-dice §1)', () => {
  const master = templateManifest('esencial')!.master!;
  const calm = { tone: 'calm' as const, temperature: 'neutral' as const, lead: 'photo' as const, exclude: [] };
  const dice = { hero: ['stack', 'framed', 'split-left'], grid: ['side-title', 'grid3'], palettes: ['linen', 'sand', 'terracotta'], fonts: ['gallery', 'editorial', 'literary'] };
  const roll = (seed: string, extra: Partial<Parameters<typeof rollStarterDice>[0]> = {}) => rollStarterDice({ seed, settings: master, dice, character: calm, photoCount: 6, recent: [], ...extra });

  it('rolls only the parts and ids the starter lists', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const out = roll(seed);
      expect(Object.keys(out.variants).sort()).toEqual(['grid', 'hero']);
      expect(dice.hero).toContain(out.variants.hero);
      expect(dice.grid).toContain(out.variants.grid);
      expect(dice.palettes).toContain(out.palette);
      expect(dice.fonts).toContain(out.fonts);
    }
  });

  it('two stores get different looks', () => {
    const looks = new Set(['s1', 's2', 's3', 's4', 's5', 's6'].map(seed => JSON.stringify(roll(seed))));
    expect(looks.size).toBeGreaterThan(2);
  });

  it('never rolls a cover the store has no photos for', () => {
    const out = rollStarterDice({ seed: 'x', settings: master, dice: { hero: ['collage', 'strip', 'framed'] }, character: calm, photoCount: 1, recent: [] });
    expect(out.variants.hero).toBe('framed');
  });

  it('does not repeat the merchant’s last store when another combination is free', () => {
    const first = roll('same');
    const second = roll('same', { recent: [{ hero: first.variants.hero!, palette: first.palette!, fonts: first.fonts! }] });
    expect(`${second.variants.hero}|${second.palette}|${second.fonts}`).not.toBe(`${first.variants.hero}|${first.palette}|${first.fonts}`);
  });

  it('a dice list without palettes or fonts leaves the starter’s own', () => {
    const out = rollStarterDice({ seed: 'x', settings: master, dice: { hero: ['stack', 'framed'] }, character: calm, photoCount: 6, recent: [] });
    expect(out.palette).toBeUndefined();
    expect(out.fonts).toBeUndefined();
  });

  it('Esencial-random never sees starter-only palettes or fonts', () => {
    const withExtras = { ...master, palettes: [...master.palettes, { ...master.palettes[0], id: 'cereza', starterOnly: true }], fonts: [...master.fonts, { ...master.fonts[0], id: 'alegre', starterOnly: true }] };
    const plain = esencialDiceSettings(withExtras);
    expect(plain.palettes.map(p => p.id)).not.toContain('cereza');
    expect(plain.fonts.map(f => f.id)).not.toContain('alegre');
    expect(plain.palettes.filter(p => !p.starterOnly)).toHaveLength(master.palettes.filter(p => !p.starterOnly).length);
  });
});

// Owner 2026-10-24 («only stores I don't like are these where it starts with a blank screen»): a store with photos never
// opens on the text-only cover, from Esencial's dice or a starter's.
describe('no text-only cover for a store with photos', () => {
  const master = templateManifest('esencial')!.master!;
  const calm = { tone: 'calm' as const, temperature: 'neutral' as const, lead: 'photo' as const, exclude: [] };
  it('Esencial never rolls «type» when the store has a photo', () => {
    for (let i = 0; i < 40; i++) expect(rollVariants({ seed: `s${i}`, settings: master, character: calm, photoCount: 1, sections: [], recent: [] }).variants.hero).not.toBe('type');
  });
  it('a starter listing «type» does not roll it when the store has a photo', () => {
    for (let i = 0; i < 20; i++) expect(rollStarterDice({ seed: `s${i}`, settings: master, dice: { hero: ['type', 'framed', 'split-left'] }, character: calm, photoCount: 2, recent: [] }).variants.hero).not.toBe('type');
  });
  it('a store with no photo at all still gets the text-only cover', () => {
    expect(rollStarterDice({ seed: 'x', settings: master, dice: { hero: ['type', 'framed'] }, character: calm, photoCount: 0, recent: [] }).variants.hero).toBe('type');
  });
});

// Owner 2026-10-24 («make stores fuller, more sections»): a store keeps up to four business sections, not two.
it('a store keeps up to four business sections', () => {
  const master = templateManifest('esencial')!.master!;
  const calm = { tone: 'calm' as const, temperature: 'neutral' as const, lead: 'photo' as const, exclude: [] };
  const out = rollVariants({ seed: 's', settings: master, character: calm, photoCount: 4, sections: ['faq', 'process', 'materials', 'visit', 'quotes'], recent: [] });
  expect(out.variants.sections).toEqual(['faq', 'process', 'materials', 'visit']);
});
