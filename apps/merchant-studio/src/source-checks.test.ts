// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { sourceCheckResult, type SourceCheck } from './source-checks';
import { MerchantStudioApi } from './api';

afterEach(() => vi.unstubAllGlobals());
it('records success, failure and blocking setup findings without treating warnings as failures', () => {
  expect(sourceCheckResult([{ label: 'Escritorio', status: 'passed' }, { label: 'Diseño', status: 'warning' }]).passed).toBe(true);
  for (const rows of [[], [{ label: 'Móvil', status: 'failed' }], [{ label: 'Catálogo', status: 'skipped', blocking: true }]] as SourceCheck[][]) expect(sourceCheckResult(rows).passed).toBe(false);
});
it('bounds persisted findings without losing a failure beyond the retained rows', () => {
  const rows: SourceCheck[] = Array.from({ length: 1000 }, () => ({ label: 'á'.repeat(500), status: 'passed', detail: '🛒'.repeat(500) }));
  rows.push({ label: 'Móvil', status: 'failed' });
  const result = sourceCheckResult(rows);
  expect(result.passed).toBe(false);
  expect(new TextEncoder().encode(JSON.stringify(result.findings)).length).toBeLessThanOrEqual(65536);
  expect(rows).toHaveLength(1001);
});
it('posts only the result and findings to the authenticated revision endpoint', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
  vi.stubGlobal('fetch', fetch);
  const body = sourceCheckResult([{ label: 'Móvil', status: 'failed' }]);
  await new MerchantStudioApi('merchant-token').recordSourceChecks('store/id', 4, body);
  expect(new Headers(fetch.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer merchant-token');
  expect(fetch).toHaveBeenCalledWith('/api/v1/stores/store%2Fid/source-project/versions/4/checks', expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }));
});
