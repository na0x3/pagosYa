import { PRESET_IDS, PRODUCT_CARD_PRESETS, presetFor } from './source-product-card-presets';
import { defaultDna, normalizeDna, sourceRuntimeDna, SOURCE_DNA_ENUMS, SOURCE_DNA_RUNTIME_ENUMS, SOURCE_DNA_SCHEMA } from './source-dna';
import { validDna } from './fixtures/dna';

const DEFAULTS = { swatch: 'pill', gallery: 'rail', blocks: 'plain', divider: 'none', enter: 'none' };

describe('product card presets', () => {
  it('ships the eight documented presets', () => {
    expect([...PRESET_IDS].sort()).toEqual(['atelier', 'boutique', 'catalogue', 'craft', 'gallery', 'plain', 'playful', 'workshop']);
  });

  it('every preset uses only values the DNA accepts', () => {
    for (const id of PRESET_IDS) {
      const { params } = presetFor(id);
      for (const [key, value] of Object.entries(params)) expect((SOURCE_DNA_ENUMS.productCard as Record<string, readonly string[]>)[key]).toContain(value);
      expect(Object.keys(params).sort()).toEqual(Object.keys(DEFAULTS).sort());
      expect(PRODUCT_CARD_PRESETS[id].when.length).toBeGreaterThan(10);
    }
  });

  it('the plain preset equals today\'s behaviour', () => {
    expect(presetFor('plain').params).toEqual(DEFAULTS);
  });

  it('rejects an unknown preset id', () => {
    expect(() => presetFor('hexagon' as never)).toThrow('unknown preset');
  });
});

describe('product card DNA', () => {
  it('seeds the defaults for every store, whatever its seed, so old stores never restyle', () => {
    for (const seed of ['a', 'b', 'store-1', 'store-42']) expect((defaultDna(seed) as any).productCard).toEqual(DEFAULTS);
    expect((defaultDna('a') as any).productCss).toBe('');
  });

  it('lets the planner choose any value, not just the default', () => {
    const props = (SOURCE_DNA_SCHEMA.properties as any).productCard.properties;
    expect(props.swatch.enum).toEqual([...SOURCE_DNA_ENUMS.productCard.swatch]);
    expect(props.gallery.enum).toEqual([...SOURCE_DNA_ENUMS.productCard.gallery]);
    expect((SOURCE_DNA_SCHEMA.properties as any).productCss.maxLength).toBe(3000);
  });

  it('normalizes an older design without the new fields to the defaults and reports nothing', () => {
    const raw = validDna() as any;
    delete raw.productCard; delete raw.productCss;
    const { dna, repairs } = normalizeDna(raw, 'store-1') as any;
    expect(dna.productCard).toEqual(DEFAULTS);
    expect(dna.productCss).toBe('');
    expect(repairs).toEqual([]);
  });

  it('repairs an invalid productCard value and names the field', () => {
    const raw = validDna() as any;
    raw.productCard = { ...DEFAULTS, swatch: 'hexagon' };
    const { dna, repairs } = normalizeDna(raw, 'store-1') as any;
    expect(dna.productCard.swatch).toBe('pill');
    expect(repairs).toEqual([expect.stringContaining('dna.productCard.swatch')]);
  });

  it('fails closed on an oversized or non-text productCss', () => {
    const big = validDna() as any; big.productCss = 'a'.repeat(3001);
    expect((normalizeDna(big, 's') as any).dna.productCss).toBe('');
    expect(normalizeDna(big, 's').repairs).toEqual([expect.stringContaining('dna.productCss')]);
    const junk = validDna() as any; junk.productCss = { x: 1 };
    expect((normalizeDna(junk, 's') as any).dna.productCss).toBe('');
  });

  it('puts the five runtime names in config.dna and productCss only when present', () => {
    for (const name of ['swatch', 'gallery', 'blocks', 'divider', 'enter']) expect(SOURCE_DNA_RUNTIME_ENUMS[name]).toBeDefined();
    const plain = sourceRuntimeDna(validDna(), 's') as any;
    expect(plain).toMatchObject(DEFAULTS);
    expect(plain.productCss).toBeUndefined();
    const themed = sourceRuntimeDna({ ...validDna(), productCard: { ...DEFAULTS, swatch: 'square' }, productCss: 'x{}' } as any, 's') as any;
    expect(themed.swatch).toBe('square');
    expect(themed.productCss).toBe('x{}');
  });
});
