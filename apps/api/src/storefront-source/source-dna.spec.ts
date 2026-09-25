import { validDna } from './fixtures/dna';
import { defaultDna, dnaFingerprint, dnaRuntimeConfig, normalizeDna, sourceRuntimeDna, SOURCE_DNA_ENUMS, SOURCE_DNA_RUNTIME_ENUMS, SOURCE_DNA_SCHEMA } from './source-dna';

describe('design DNA', () => {
  it('accepts a full valid DNA unchanged', () => {
    expect(normalizeDna(validDna(), 'store-1')).toEqual({ dna: validDna(), repairs: [] });
  });

  it('replaces every invalid enum with the seeded default for that field and reports it', () => {
    const fallback = defaultDna('store-1') as any;
    for (const [group, keys] of Object.entries(SOURCE_DNA_ENUMS)) for (const key of Object.keys(keys)) {
      const raw = validDna() as any;
      raw[group][key] = 'sparkle';
      const { dna, repairs } = normalizeDna(raw, 'store-1') as any;
      expect(dna[group][key]).toBe(fallback[group][key]);
      expect(repairs).toEqual([expect.stringContaining(`dna.${group}.${key}`)]);
      expect({ ...dna, [group]: { ...dna[group], [key]: raw[group][key] } }).toEqual(raw);
    }
  });

  it('uses the whole seeded default when the DNA is missing', () => {
    expect(normalizeDna(undefined, 'store-1')).toEqual({ dna: defaultDna('store-1'), repairs: [expect.stringContaining('dna')] });
  });

  it('bounds the prose so three worst-case DNAs fit the planner output budget', () => {
    const motif = SOURCE_DNA_SCHEMA.properties.motifs.items.properties;
    expect([motif.target.maxLength, motif.meaning.maxLength, SOURCE_DNA_SCHEMA.properties.signature.maxLength]).toEqual([40, 80, 100]);
    const raw = validDna() as any;
    raw.motifs = [{ ...raw.motifs[0], target: 't'.repeat(90), meaning: 'm'.repeat(200) }];
    const { dna, repairs } = normalizeDna(raw, 's');
    expect([dna.motifs[0].target.length, dna.motifs[0].meaning.length]).toEqual([40, 80]);
    expect(repairs).toEqual([expect.stringContaining('target: cut to 40'), expect.stringContaining('meaning: cut to 80')]);
  });

  it('caps motifs at three, drops invalid ones and cuts the signature at 100', () => {
    const raw = validDna() as any;
    const motif = raw.motifs[0];
    raw.motifs = [motif, { ...motif, behavior: 'explode' }, motif, motif, motif];
    raw.signature = 'x'.repeat(400);
    const { dna, repairs } = normalizeDna(raw, 's');
    expect(dna.motifs).toEqual([motif, motif, motif]);
    expect(dna.signature).toHaveLength(100);
    expect(repairs).toEqual([expect.stringContaining('motifs[1]'), expect.stringContaining('motifs'), expect.stringContaining('signature')]);
  });

  it('derives a stable, valid default that differs between stores', () => {
    expect(defaultDna('store-1')).toEqual(defaultDna('store-1'));
    expect(normalizeDna(defaultDna('store-1'), 'other').repairs).toEqual([]);
    const prints = new Set(Array.from({ length: 50 }, (_, i) => dnaFingerprint(defaultDna(`store-${i}`))));
    expect(prints.size).toBeGreaterThanOrEqual(40);
  });

  it('fingerprints button form, cart, added style and type pairing', () => {
    expect(dnaFingerprint(validDna())).toBe('stamp|sheet|ribbon|fraunces+instrument');
  });

  it('gives the runtime enums only, no prose', () => {
    const runtime = dnaRuntimeConfig(validDna()) as Record<string, unknown>;
    expect(Object.keys(runtime).sort()).toEqual(['version', ...Object.keys(SOURCE_DNA_RUNTIME_ENUMS)].sort());
    for (const [name, values] of Object.entries(SOURCE_DNA_RUNTIME_ENUMS)) expect(values).toContain(runtime[name]);
    expect(runtime).toMatchObject({ button: 'stamp', cart: 'sheet', added: 'ribbon', motion: 'playful', product: 'story-led' });
    expect(JSON.stringify(runtime)).not.toMatch(/boleto|vapor|Café/);
  });

  it('aligns the runtime product surface to the product page style the kit reads', () => {
    expect(sourceRuntimeDna(undefined, 'store-1', 'dense')).toEqual({ ...dnaRuntimeConfig(defaultDna('store-1')), product: 'dense' });
    expect(sourceRuntimeDna(validDna(), 'store-1', 'luxury')).toEqual(dnaRuntimeConfig(validDna()));
  });

  it('describes a strict schema: every property required, no extra keys', () => {
    const strict = (schema: any): void => {
      if (schema.type !== 'object') { if (schema.items) strict(schema.items); return; }
      expect(schema.additionalProperties).toBe(false);
      expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
      Object.values(schema.properties).forEach(strict);
    };
    strict(SOURCE_DNA_SCHEMA);
    expect(SOURCE_DNA_SCHEMA.properties.buttons.properties.form.enum).toEqual([...SOURCE_DNA_ENUMS.buttons.form]);
    expect(SOURCE_DNA_SCHEMA.properties.motifs.maxItems).toBe(3);
  });
});
