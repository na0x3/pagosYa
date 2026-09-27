import { SOURCE_DNA_ENUMS } from './source-dna';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';
import { SOURCE_FONT_PAIRINGS, SOURCE_FONT_PERSONALITIES, sourceFontPairing, sourceFontPairingsFor } from './source-font-pairings';

const role = (id: string) => SOURCE_FONT_CATALOG.find(font => font.id === id)!.role;

describe('font pairings', () => {
  it('lists about 24 distinct pairings of bundled fonts, named display+text', () => {
    expect(SOURCE_FONT_PAIRINGS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(SOURCE_FONT_PAIRINGS.map(pairing => pairing.id)).size).toBe(SOURCE_FONT_PAIRINGS.length);
    for (const pairing of SOURCE_FONT_PAIRINGS) {
      expect(pairing.id).toBe(`${pairing.display}+${pairing.text}`);
      expect(SOURCE_DNA_ENUMS.type.display).toContain(pairing.display);
      expect(SOURCE_DNA_ENUMS.type.text).toContain(pairing.text);
    }
  });

  it('puts a display face on top and a reading face below', () => {
    for (const pairing of SOURCE_FONT_PAIRINGS) {
      expect({ id: pairing.id, display: ['display', 'both'].includes(role(pairing.display)), text: ['text', 'both'].includes(role(pairing.text)) }).toEqual({ id: pairing.id, display: true, text: true });
    }
  });

  it('gives every personality at least three pairings and every pairing one to three personalities', () => {
    for (const personality of SOURCE_FONT_PERSONALITIES) expect({ personality, enough: sourceFontPairingsFor(personality).length >= 3 }).toEqual({ personality, enough: true });
    for (const pairing of SOURCE_FONT_PAIRINGS) {
      expect(pairing.personalities.length).toBeGreaterThanOrEqual(1);
      expect(pairing.personalities.length).toBeLessThanOrEqual(3);
    }
  });

  it('reaches well past the five fonts generation mostly uses', () => {
    expect(new Set(SOURCE_FONT_PAIRINGS.flatMap(pairing => [pairing.display, pairing.text])).size).toBeGreaterThanOrEqual(24);
  });

  it('finds pairings by id and by personality', () => {
    expect(sourceFontPairing('shrikhand+nunito')?.personalities).toContain('playful');
    expect(sourceFontPairing('comic-sans+arial')).toBeUndefined();
    expect(sourceFontPairingsFor('luxury').every(pairing => pairing.personalities.includes('luxury'))).toBe(true);
  });
});
