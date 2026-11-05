import { sourceMerchantRequest, sourceMerchantRequestKey } from './source-merchant-request';
const input = { instruction: 'Use these photos', revision: 1, assetUrls: ['/b', '/a'] };
it('preserves retry identity across serialized property and asset ordering', () => {
  const request = sourceMerchantRequest(input, 'context');
  expect(sourceMerchantRequestKey(request)).toBe(sourceMerchantRequestKey({ ...request, assetUrls: ['/a', '/b'], options: { motion: undefined, templateId: undefined } }));
});
it('invalidates retained work when the original request, base, context or design choice changes', () => {
  const request = sourceMerchantRequest(input, 'context');
  for (const change of [{ instruction: 'Replace all photos' }, { baseRevision: 2 }, { contextAnchor: 'new-context' }, { assetUrls: ['/other'] }, { options: { templateId: 'miga' } }]) {
    expect(sourceMerchantRequestKey({ ...request, ...change })).not.toBe(sourceMerchantRequestKey(request));
  }
});

it('keeps a template address and the hash of a circle; two different circles are two requests (spec 2026-11-05 point-at)', () => {
  const base = { revision: 2, instruction: 'hazla más corta', assetUrls: [] };
  const at = sourceMerchantRequest({ ...base, selection: { sectionId: 'lb-1', at: 1, page: 'home' } } as never);
  expect(at.selection).toEqual({ sectionId: 'lb-1', at: 1, page: 'home' });
  const one = sourceMerchantRequest({ ...base, selection: { sectionId: 'lb-1', area: { points: [1, 1, 2, 2, 3, 3] } } } as never);
  const two = sourceMerchantRequest({ ...base, selection: { sectionId: 'lb-1', area: { points: [9, 9, 2, 2, 3, 3] } } } as never);
  expect(one.selection?.area).toMatch(/^[a-f0-9]{12}$/);
  expect(sourceMerchantRequestKey(one)).not.toBe(sourceMerchantRequestKey(two));
});
