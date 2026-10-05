import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildDesignDemos, DEMO_OUTPUT } from '../../../scripts/generate-design-demos';
it('renders the three production demo fixtures at desktop, tablet and mobile widths', async () => {
  await buildDesignDemos(true);
  const evidence = JSON.parse(await readFile(resolve(DEMO_OUTPUT, 'evidence.json'), 'utf8'));
  expect(evidence).toHaveLength(9);
  for (const shot of evidence) {
    expect(shot.scrollWidth).toBeLessThanOrEqual(shot.viewport + 2);
    expect(shot.headings).toBe(1);
    expect(shot.cards).toBe(3);
    expect(shot.missingImages).toBe(0);
    expect(shot.errors).toEqual([]);
    expect(shot.mobileMenu).toBe(true);
  }
}, 120_000);

it('benchmarks the same AFTER HOURS data across three distinct desktop/mobile compositions with live cart behavior', async () => {
  await buildDesignDemos(true, true);
  const evidence = JSON.parse(await readFile(resolve(DEMO_OUTPUT, 'evidence.json'), 'utf8'));
  expect(evidence).toHaveLength(9);
  expect(new Set(evidence.filter((e: any) => e.width === 1440).map((e: any) => e.silhouette)).size).toBe(3);
  for (const shot of evidence) {
    expect(shot.scrollWidth).toBeLessThanOrEqual(shot.viewport + 2);
    expect(shot.headings).toBe(1); expect(shot.cards).toBe(3); expect(shot.missingImages).toBe(0);
    expect(shot.errors).toEqual([]); expect(shot.mobileMenu).toBe(true); expect(shot.commerce).toBe(true);
  }
}, 180_000);
