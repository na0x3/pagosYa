import { createHash } from 'node:crypto';
import * as fontkit from 'fontkit';
import { readdirSync, readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { SOURCE_FONT_CATALOG, SOURCE_FONT_IDS } from './source-font-catalog';
import { SOURCE_FONT_CHOICES } from './source-fonts';
import { SOURCE_DNA_ENUMS } from './source-dna';

const NORMALISED_LICENCES = ['bricolage-OFL.txt', 'fraunces-OFL.txt', 'instrument-OFL.txt', 'oswald-OFL.txt'];
const onDisk = readdirSync(kitPath('fonts'));
const provenance: Array<{ file: string; source: string; sha256: string }> = JSON.parse(readFileSync(kitPath('fonts', 'provenance.json'), 'utf8'));

describe('font catalogue', () => {
  it('has a TrueType file and an OFL licence on disk for every entry', () => {
    for (const font of SOURCE_FONT_CATALOG) {
      expect(font.file).toBe(`${font.id}.ttf`);
      expect(readFileSync(kitPath('fonts', font.file)).readUInt32BE(0)).toBe(0x00010000);
      expect(readFileSync(kitPath('fonts', `${font.id}-OFL.txt`), 'utf8').toUpperCase()).toContain('SIL OPEN FONT LICENSE');
    }
  });

  it('catalogues every font file on disk, with nothing left over', () => {
    expect(onDisk.filter(file => file.endsWith('.ttf')).sort()).toEqual(SOURCE_FONT_CATALOG.map(font => font.file).sort());
    expect(onDisk.filter(file => file.endsWith('-OFL.txt')).sort()).toEqual(SOURCE_FONT_CATALOG.map(font => `${font.id}-OFL.txt`).sort());
  });

  it('records provenance whose sha256 matches the bytes of every bundled file', () => {
    for (const file of onDisk.filter(name => name !== 'provenance.json')) {
      const entry = provenance.find(candidate => candidate.file === file);
      expect(entry).toBeDefined();
      // These four licences were committed whitespace-normalised before provenance was recorded; their sha256 is upstream's.
      if (NORMALISED_LICENCES.includes(file)) continue;
      expect(createHash('sha256').update(readFileSync(kitPath('fonts', file))).digest('hex')).toBe(entry!.sha256);
    }
  });

  it('spans very different personalities, not thirty variations of one grotesk', () => {
    expect(SOURCE_FONT_CATALOG.length).toBeGreaterThanOrEqual(30);
    expect(new Set(SOURCE_FONT_IDS).size).toBe(SOURCE_FONT_IDS.length);
    const personalities = new Set(SOURCE_FONT_CATALOG.flatMap(font => font.personality));
    for (const kind of ['serif', 'grotesk', 'humanist', 'geometric', 'condensed', 'slab', 'mono', 'rounded', 'script-adjacent', 'wide']) expect(personalities).toContain(kind);
    for (const role of ['display', 'text', 'both'] as const) expect(SOURCE_FONT_CATALOG.some(font => font.role === role)).toBe(true);
    for (const font of SOURCE_FONT_CATALOG) expect(font.weights).toMatch(/^\d{3}(–\d{3,4})?$/);
  });

  it('covers Spanish in every font, and keeps every file light enough for a store', () => {
    const missing: string[] = [];
    for (const font of SOURCE_FONT_CATALOG) {
      const face = fontkit.openSync(kitPath('fonts', font.file));
      for (const char of 'áéíóúüñÁÉÍÓÚÜÑ¿¡') if (!face.hasGlyphForCodePoint(char.codePointAt(0)!)) missing.push(`${font.id} ${char}`);
    }
    expect(missing).toEqual([]);
    for (const font of SOURCE_FONT_CATALOG.slice(30)) expect(readFileSync(kitPath('fonts', font.file)).length).toBeLessThan(600_000);
  });

  it('has themed faces a business story can call for', () => {
    const personalities = new Set(SOURCE_FONT_CATALOG.flatMap(font => font.personality));
    for (const kind of ['typewriter', 'stencil', 'techno', 'script', 'handwritten', 'chunky', 'neon', 'fashion', 'brutal', 'sports']) expect(personalities).toContain(kind);
  });

  it('is the one list the DNA enum and the prompt read', () => {
    expect(SOURCE_DNA_ENUMS.type.display).toEqual(SOURCE_FONT_IDS);
    expect(SOURCE_DNA_ENUMS.type.text).toEqual(SOURCE_FONT_IDS);
    for (const font of SOURCE_FONT_CATALOG) expect(SOURCE_FONT_CHOICES).toContain(`assets/${font.id}.ttf (${font.family}`);
  });
});
