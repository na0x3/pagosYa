import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { kitPath } from '@pagosya/storefront-kit';
import { SOURCE_DNA_ENUMS } from './source-dna';
import { SOURCE_MOTION_TOKENS } from './source-motion-tokens';

/** Sub-project 6: one token table per personality. The kit's copy (commerce.js) generates the CSS; the API's is canonical. */
const bezier = (curve: string) => curve.match(/^cubic-bezier\(([^)]*)\)$/)![1].split(',').map(Number);
const kitTable = (source: string, pattern: RegExp) => runInNewContext(`(${source.match(pattern)![1]})`);

describe('motion personality tokens', () => {
  it('has exactly the DNA personalities, with the spec values', () => {
    expect(Object.keys(SOURCE_MOTION_TOKENS)).toEqual([...SOURCE_DNA_ENUMS.motion.personality]);
    expect(SOURCE_MOTION_TOKENS.calm).toEqual(expect.objectContaining({ ease: 'cubic-bezier(.25,.1,.25,1)', exit: 'cubic-bezier(.4,0,1,1)', fast: 180, base: 320, slow: 560, distance: 12, stagger: 70, parallax: 0.5, press: 0.98 }));
    expect(SOURCE_MOTION_TOKENS.snappy).toEqual(expect.objectContaining({ ease: 'cubic-bezier(.2,.9,.2,1)', exit: 'cubic-bezier(.4,0,.6,1)', fast: 120, base: 200, slow: 320, distance: 8, stagger: 35, parallax: 0.3, press: 0.96 }));
    expect(SOURCE_MOTION_TOKENS.playful).toEqual(expect.objectContaining({ ease: 'cubic-bezier(.34,1.56,.64,1)', exit: 'cubic-bezier(.36,0,.66,-.56)', fast: 200, base: 360, slow: 600, distance: 18, stagger: 60, parallax: 0.8, press: 0.92 }));
    expect(SOURCE_MOTION_TOKENS.cinematic).toEqual(expect.objectContaining({ ease: 'cubic-bezier(.16,1,.3,1)', exit: 'cubic-bezier(.7,0,.84,0)', fast: 260, base: 520, slow: 900, distance: 28, stagger: 110, parallax: 1.3, press: 0.98 }));
  });

  it('gives every personality settle curves that never leave 0..1; only playful differs from its spec curves', () => {
    for (const [name, tokens] of Object.entries(SOURCE_MOTION_TOKENS)) {
      for (const curve of [tokens.settle, tokens.settleExit]) {
        const [, y1, , y2] = bezier(curve);
        expect({ name, curve, inside: y1 >= 0 && y1 <= 1 && y2 >= 0 && y2 <= 1 }).toEqual({ name, curve, inside: true });
      }
      if (name === 'playful') { expect(tokens.settle).not.toBe(tokens.ease); expect(tokens.settleExit).not.toBe(tokens.exit); }
      else { expect(tokens.settle).toBe(tokens.ease); expect(tokens.settleExit).toBe(tokens.exit); }
    }
  });

  it('keeps durations short enough for an opening under 1000ms and never flashes', () => {
    for (const tokens of Object.values(SOURCE_MOTION_TOKENS)) {
      expect(tokens.fast).toBeLessThan(tokens.base);
      expect(tokens.base).toBeLessThan(tokens.slow);
      expect(tokens.slow).toBeLessThanOrEqual(900);
    }
  });

  it('the kit table in commerce.js is the same table', () => {
    const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
    expect(kitTable(commerce, /const MOTION_TOKENS = (\{[\s\S]*?\n {2}\});/)).toEqual(SOURCE_MOTION_TOKENS);
  });
});
