// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { keepPromo, promoOf } from '../src/source-storefront';

// Popups 2.0 final review (I1): a published store's frame cannot keep the popup code across pages; this page keeps it per store.
describe('the popup code kept by the published store page', () => {
  it('keeps a code per store and ignores anything else', () => {
    keepPromo('calima', 'POPABC234');
    keepPromo('calima', 'not a code<');
    expect(promoOf('calima')).toBe('POPABC234');
    expect(promoOf('otra')).toBe('');
  });
});
