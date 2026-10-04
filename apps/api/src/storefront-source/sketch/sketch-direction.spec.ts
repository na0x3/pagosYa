import { drawSketchDirection } from './sketch-direction';
import { SKETCH_STYLE_OPTIONS } from './sketch-schema';

// mulberry32, not a bare LCG: an LCG's first draw is linear in the seed, so every seed would pick the same first value.
const seeded = (a: number) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

describe('drawSketchDirection style', () => {
  // Guards against anyone hand-listing the keys: a key added to the options but not drawn would silently default.
  it('draws a value for every style key, so none silently defaults', () => {
    const style = drawSketchDirection(seeded(5)).style;
    expect(Object.keys(style).sort()).toEqual(Object.keys(SKETCH_STYLE_OPTIONS).sort());
    for (const key of Object.keys(SKETCH_STYLE_OPTIONS) as (keyof typeof SKETCH_STYLE_OPTIONS)[]) {
      expect(SKETCH_STYLE_OPTIONS[key]).toContain(style[key]);
    }
  });

  it('does not land on the same component set every time', () => {
    const sets = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) sets.add(JSON.stringify(drawSketchDirection(seeded(seed)).style));
    expect(sets.size).toBeGreaterThanOrEqual(35);
  });
});
