import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEPARTMENTS, DEPARTMENT_CENTERS, LEAFLET_CSS_SRI, LEAFLET_JS_SRI, destinationMarkup, insideBolivia, mountDestinationMap } from '../src/shipping-destination';

// The storefront kit ships standalone with its own copy of these helpers; keep both in step.
const kit = readFileSync(resolve(__dirname, '../../../packages/storefront-kit/kit/commerce.js'), 'utf8');
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

describe('Leaflet Subresource Integrity', () => {
  it('pins the same sha512 hashes in the kit and in checkout', () => {
    expect(LEAFLET_JS_SRI).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/);
    expect(LEAFLET_CSS_SRI).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/);
    expect(kitValue('LEAFLET_JS_SRI')).toBe(LEAFLET_JS_SRI);
    expect(kitValue('LEAFLET_CSS_SRI')).toBe(LEAFLET_CSS_SRI);
    expect(kit).toContain("script.integrity = LEAFLET_JS_SRI; script.crossOrigin = 'anonymous';");
    expect(kit).toContain("css.integrity = LEAFLET_CSS_SRI; css.crossOrigin = 'anonymous';");
  });

  it('checkout sets integrity and crossorigin on the Leaflet tags it adds', () => {
    const root = document.createElement('div'); root.innerHTML = destinationMarkup(); document.body.append(root);
    void mountDestinationMap(root).catch(() => {});
    const script = document.head.querySelector<HTMLScriptElement>('script[src$="leaflet.min.js"]')!;
    const css = document.head.querySelector<HTMLLinkElement>('link[href$="leaflet.min.css"]')!;
    expect(script.integrity).toBe(LEAFLET_JS_SRI); expect(script.crossOrigin).toBe('anonymous');
    expect(css.integrity).toBe(LEAFLET_CSS_SRI); expect(css.crossOrigin).toBe('anonymous');
  });
});
