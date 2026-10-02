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
