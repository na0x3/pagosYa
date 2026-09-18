import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEPARTMENTS, DEPARTMENT_CENTERS, insideBolivia } from '../src/shipping-destination';

// The storefront kit ships standalone with its own copy of these helpers; keep both in step.
const kit = readFileSync(resolve(__dirname, '../../api/src/stores/source-kit/commerce.js'), 'utf8');
const kitValue = (name: string) => {
  const match = kit.match(new RegExp(`const ${name} = (.+);\\n`));
  if (!match) throw new Error(`${name} not found in commerce.js`);
  return new Function(`return (${match[1]});`)();
};

describe('kit and checkout shipping-destination parity', () => {
  it('uses the same departments and map centers', () => {
    expect(kitValue('DEPARTMENTS')).toEqual(DEPARTMENTS);
    expect(kitValue('DEPARTMENT_CENTERS')).toEqual(DEPARTMENT_CENTERS);
  });

  it('uses the same Bolivia bounding box', () => {
    const kitInside = kitValue('insideBolivia') as (lat: number, lng: number) => boolean;
    const samples: Array<[number, number]> = [[-23, -69.7], [-9.6, -57.4], [-23.0001, -63], [-9.5999, -63], [-17, -69.7001], [-17, -57.3999], [-17.78, -63.18], [Number.NaN, -63]];
    for (const [lat, lng] of samples) expect(kitInside(lat, lng), `${lat},${lng}`).toBe(insideBolivia(lat, lng));
  });
});
