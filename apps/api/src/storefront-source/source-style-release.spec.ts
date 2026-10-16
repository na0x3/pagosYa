import { styleReleaseWaitMs } from './source-style-release';

/** Live 2026-10-15 (store pz2zcl3k): a pick 6 s after the cards became choosable failed «Ya hay una generación en curso»: the
 *  style run released the store 38 s later (hero wait, then the store-voice call) while the pick gave up after 20 s. */
describe('styleReleaseWaitMs', () => {
  it('outlasts the hero wait plus the store-voice deadline, longer on the ChatGPT plan', () => {
    expect(styleReleaseWaitMs(false)).toBeGreaterThanOrEqual(15_000 + 60_000);
    expect(styleReleaseWaitMs(true)).toBeGreaterThanOrEqual(15_000 + 180_000);
    expect(styleReleaseWaitMs(false)).toBeGreaterThan(38_000);
  });
});
