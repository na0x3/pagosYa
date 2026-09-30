import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

// The merchant asked for no animation while YAPI thinks (2026-09-30): the waiting states only show status and time.
it('the build progress styles move nothing', () => {
  expect(css('source-build-progress.css')).not.toMatch(/animation|transition|@keyframes/);
});

it('the live draft badge does not pulse', () => {
  expect(css('source-studio.css')).not.toMatch(/live-draft-pulse|\.live-draft-badge::before\{[^}]*animation/);
});
