import { privacy } from '../src/privacy';
import { beforeEach, expect, it, vi } from 'vitest';
import { sourceVisitorId, rememberSourceVisit, sourceVisitToken } from '../src/source-attribution';
beforeEach(()=>{localStorage.clear();sessionStorage.clear();vi.restoreAllMocks();});
it('keeps a stable browser id per store and replaces invalid saved identities',()=>{
  privacy.save('one', true);privacy.save('two', true);const first=sourceVisitorId('one');expect(first).toBeTruthy();expect(sourceVisitorId('one')).toBe(first);expect(sourceVisitorId('two')).not.toBe(first);
  localStorage.setItem('pagosya:source-visitor:one','invalid');expect(sourceVisitorId('one')).not.toBe(first);expect(sourceVisitorId('one')).toMatch(/^[a-f0-9-]{36}$/);
});
it('keeps checkout attribution store-scoped, expires it and clears it after a test',()=>{
  privacy.save('one', true);rememberSourceVisit('one','v'.repeat(32));expect(sourceVisitToken('one')).toBe('v'.repeat(32));expect(sourceVisitToken('two')).toBeUndefined();
  const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+31*86400000);expect(sourceVisitToken('one')).toBeUndefined();
  rememberSourceVisit('one',null);expect(sessionStorage.getItem('pagosya:source-visit:one')).toBeNull();
});
it('uses an untracked view if persistent storage is unavailable',()=>{
  vi.spyOn(localStorage,'getItem').mockImplementation(()=>{throw new Error('Blocked');});
  expect(sourceVisitorId('one')).toBeUndefined();expect(sourceVisitToken('one')).toBeUndefined();
});
