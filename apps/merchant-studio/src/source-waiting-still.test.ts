import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

// The merchant asked for no animation while YAPI thinks (2026-09-30), then for the bouncing star (2026-10-08): the star
// is the one thing that moves, it lives in its own stylesheet, and it stops for reduced motion.
it('the build progress styles move nothing but the star', () => {
  expect(css('source-build-progress.css')).not.toMatch(/animation|transition|@keyframes/);
  expect(css('source-loader-star.css')).toMatch(/\.build-star\{[^}]*animation:build-star-hop/);
  expect(css('source-loader-star.css')).toMatch(/prefers-reduced-motion:reduce\)\{[^}]*\.build-star\{animation:none\}/);
});

it('the live draft badge does not pulse', () => {
  expect(css('source-studio.css')).not.toMatch(/live-draft-pulse|\.live-draft-badge::before\{[^}]*animation/);
});

it('the running step is the star, not a filled dot or a lopsided ring left over from the spinner, and no orphan stage rule remains', () => {
  const progress = css('source-build-progress.css');
  expect(progress).not.toMatch(/\.build-state\.is-running\s*\{[^}]*border-top-color/);
  expect(progress).toMatch(/\.build-state\.is-running\s*\{[^}]*border:\s*0;[^}]*background:\s*none/);
  expect(progress).not.toContain('yapi-stage__scene');
});
