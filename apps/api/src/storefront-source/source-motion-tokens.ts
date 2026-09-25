import type { SourceDesignDna } from './source-dna';

export type SourceMotionPersonality = SourceDesignDna['motion']['personality'];
export type SourceMotionTokenSet = {
  /** Enter curve; playful's overshoots, so it is used on transforms only. */ ease: string;
  /** Enter curve that stays inside 0..1: every other property, and surfaces anchored to a screen edge. */ settle: string;
  /** Exit curve; playful's anticipates (goes below 0), so it is used on transforms only. */ exit: string;
  /** Exit curve that stays inside 0..1. */ settleExit: string;
  /** Durations in ms. */ fast: number; base: number; slow: number;
  /** Reveal travel in px. */ distance: number;
  /** Delay between grouped items, ms. */ stagger: number;
  /** Multiplier on a parallax strength. */ parallax: number;
  /** Scale a pressed control starts its pulse from. */ press: number;
};

/**
 * The store's motion personality (DNA `motion.personality`, `html[data-dna-motion]`) as tokens. The kit keeps the same
 * table (`MOTION_TOKENS` in commerce.js, `MOTION_PERSONALITIES` in ui.tsx; tests pin them equal). Tokens exist only for
 * a personality: every use site falls back to its own literal, so a store without one moves exactly as before.
 */
export const SOURCE_MOTION_TOKENS: Record<SourceMotionPersonality, SourceMotionTokenSet> = {
  calm: { ease: 'cubic-bezier(.25,.1,.25,1)', settle: 'cubic-bezier(.25,.1,.25,1)', exit: 'cubic-bezier(.4,0,1,1)', settleExit: 'cubic-bezier(.4,0,1,1)', fast: 180, base: 320, slow: 560, distance: 12, stagger: 70, parallax: 0.5, press: 0.98 },
  snappy: { ease: 'cubic-bezier(.2,.9,.2,1)', settle: 'cubic-bezier(.2,.9,.2,1)', exit: 'cubic-bezier(.4,0,.6,1)', settleExit: 'cubic-bezier(.4,0,.6,1)', fast: 120, base: 200, slow: 320, distance: 8, stagger: 35, parallax: 0.3, press: 0.96 },
  playful: { ease: 'cubic-bezier(.34,1.56,.64,1)', settle: 'cubic-bezier(.22,1,.36,1)', exit: 'cubic-bezier(.36,0,.66,-.56)', settleExit: 'cubic-bezier(.5,0,.75,0)', fast: 200, base: 360, slow: 600, distance: 18, stagger: 60, parallax: 0.8, press: 0.92 },
  cinematic: { ease: 'cubic-bezier(.16,1,.3,1)', settle: 'cubic-bezier(.16,1,.3,1)', exit: 'cubic-bezier(.7,0,.84,0)', settleExit: 'cubic-bezier(.7,0,.84,0)', fast: 260, base: 520, slow: 900, distance: 28, stagger: 110, parallax: 1.3, press: 0.98 },
};

/** Prompt guidance (stable across stores): the personality is given per store as 'Motion personality'. Not a validator. */
export const SOURCE_MOTION_PERSONALITY_DIRECTION = "The store's motion personality is given as 'Motion personality'. The runtime sets it on :root: --motion-fast, --motion-base, --motion-slow, --motion-ease (may overshoot: transforms only), --motion-ease-settle, --motion-distance, --motion-stagger. Author timing with them and a fallback, e.g. var(--motion-base,300ms), not literals; with @pagosya/ui leave duration and stagger unset.";

export function sourceMotionPersonalityLine(personality: SourceMotionPersonality): string {
  return `Motion personality: ${personality}.`;
}
