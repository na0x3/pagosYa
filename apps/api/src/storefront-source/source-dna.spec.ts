import { createHash } from 'node:crypto';
import { validDna } from './fixtures/dna';
import { avoidTakenFingerprint, defaultDna, withSeededDna, dnaFingerprint, dnaRuntimeConfig, normalizeDna, sourceRuntimeDna, SOURCE_DNA_ENUMS, SOURCE_DNA_RUNTIME_ENUMS, SOURCE_DNA_SCHEMA } from './source-dna';

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

  it('seeds a DNA into a stored config.js without one, and leaves the rest alone', () => {
    const config = (value: object) => ({ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(value)};`, encoding: 'utf8' as const });
    const read = (files: Array<{ path: string; content: string }>) => JSON.parse(files.find(f => f.path === 'config.js')!.content.match(/=\s*([\s\S]*?);?\s*$/)![1]);
    const page = { path: 'index.html', content: '<main></main>', encoding: 'utf8' as const };
    const seeded = withSeededDna([page, config({ productPageStyle: 'dense', data: {} })], 'store-7');
    expect(seeded[0]).toBe(page);
    expect(read(seeded)).toEqual({ productPageStyle: 'dense', data: {}, dna: sourceRuntimeDna(undefined, 'store-7', 'dense') });
    const own = [page, config({ dna: { button: 'pill' } })];
    expect(withSeededDna(own, 'store-7')[1]).toBe(own[1]);
    const unreadable = [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {', encoding: 'utf8' as const }];
    expect(withSeededDna(unreadable, 'store-7')[0]).toBe(unreadable[0]);
  });
});

describe('avoidTakenFingerprint', () => {
  const fields = [['buttons', 'form'], ['surfaces', 'cart'], ['surfaces', 'added']] as const;
  const index = (dna: any, [group, key]: readonly [string, string]) => (SOURCE_DNA_ENUMS as any)[group][key].indexOf(dna[group][key]);

  it('returns the same DNA with no repair when its fingerprint is free', () => {
    const dna = validDna();
    const result = avoidTakenFingerprint(dna, ['pill|drawer|toast|oswald+instrument'], 'store-1:0');
    expect(result.dna).toBe(dna);
    expect(result.repair).toBeUndefined();
  });

  it('moves exactly two of button form, cart and added to the nearest unused values, deterministically', () => {
    const dna = validDna();
    const taken = [dnaFingerprint(dna)];
    const result = avoidTakenFingerprint(dna, taken, 'store-1:0');
    expect(taken).not.toContain(dnaFingerprint(result.dna));
    const changed = fields.filter(field => index(result.dna, field) !== index(dna, field));
    expect(changed).toHaveLength(2);
    for (const field of changed) {
      const size = (SOURCE_DNA_ENUMS as any)[field[0]][field[1]].length;
      const distance = Math.abs(index(result.dna, field) - index(dna, field));
      expect(Math.min(distance, size - distance)).toBe(1);
    }
    expect(result.dna.type).toEqual(dna.type);
    expect(dna).toEqual(validDna());
    expect(avoidTakenFingerprint(validDna(), taken, 'store-1:0')).toEqual(result);
    expect(result.repair).toMatch(/^dna: fingerprint stamp\|sheet\|ribbon\|fraunces\+instrument was used by a recent store; /);
  });

  it('keeps looking past taken neighbours and never lands on a taken fingerprint', () => {
    const dna = validDna();
    const taken = new Set([dnaFingerprint(dna)]);
    // Block every single-step neighbour pair.
    for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) for (const da of [-1, 1]) for (const db of [-1, 1]) {
      const copy: any = structuredClone(dna);
      for (const [field, delta] of [[fields[a], da], [fields[b], db]] as const) {
        const values = (SOURCE_DNA_ENUMS as any)[field[0]][field[1]];
        copy[field[0]][field[1]] = values[(index(dna, field) + delta + values.length) % values.length];
      }
      taken.add(dnaFingerprint(copy));
    }
    for (const seed of ['a', 'b', 'c', 'd']) {
      const result = avoidTakenFingerprint(dna, [...taken], seed);
      expect(taken.has(dnaFingerprint(result.dna))).toBe(false);
      expect(fields.filter(field => index(result.dna, field) !== index(dna, field))).toHaveLength(2);
    }
  });
});

describe('identity libraries (T2b) DNA values', () => {
  it('accepts the four new button forms', () => {
    for (const form of ['sticker', 'ticket', 'bubbly', 'brutal']) {
      const raw = validDna() as any;
      raw.buttons.form = form;
      expect(normalizeDna(raw, 'store-1')).toEqual({ dna: raw, repairs: [] });
      expect(dnaRuntimeConfig(raw).button).toBe(form);
    }
  });

  it('never seeds a T2b value, so stores seeded before them keep exactly the DNA they had', () => {
    const all = Array.from({ length: 50 }, (_, i) => defaultDna(`store-${i}`));
    expect(createHash('sha256').update(JSON.stringify(all)).digest('hex')).toBe('6b24050e210099c82f1bd48afee26df3daaabc4f1c08a62998b6a02f5d9fa84b');
    expect(defaultDna('cafe-luna')).toEqual({ version: 1, type: { display: 'bebas-neue', text: 'rubik', case: 'upper', tracking: 'tight' }, shape: { radius: 'none', border: 'hairline', frame: 'inset' }, buttons: { form: 'stamp', hover: 'invert', press: 'pop' }, motion: { personality: 'calm' }, layout: { grammar: 'magazine', density: 'dense' }, surfaces: { cart: 'drawer', added: 'bubble', product: 'dense', review: 'notebook', card: 'zoom' }, motifs: [], signature: '' });
    const forms = new Set(Array.from({ length: 500 }, (_, i) => defaultDna(`seed-${i}`).buttons.form));
    for (const form of ['sticker', 'ticket', 'bubbly', 'brutal']) expect(forms.has(form as any)).toBe(false);
  });
});
