import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Variety spec §5: the background personal touch saves a newer revision; the open Studio follows it, so the merchant's next
// request carries the new revision instead of being refused with «El sitio cambió».
describe('personal touch follow-up', () => {
  const source = readFileSync(new URL('./source-studio.ts', import.meta.url), 'utf8');
  it('after a reply with a revision, the Studio follows a background job on the store', () => {
    expect(source).toMatch(/async function followBackgroundJob\(/);
    expect(source).toMatch(/void followBackgroundJob\(storeId, requestId\)/);
  });
  it('it never takes the build lock and reloads only when the merchant is not building', () => {
    const body = source.slice(source.indexOf('async function followBackgroundJob('), source.indexOf('async function followBackgroundJob(') + 900);
    expect(body).not.toContain('transitionBuild');
    expect(body).toContain('building()');
  });
});

describe('review fix: reopening the Studio during a personal touch', () => {
  const source = readFileSync(new URL('./source-studio.ts', import.meta.url), 'utf8');
  it('a background job found at boot is followed without the build lock', () => {
    const boot = source.slice(source.indexOf('async function boot()'), source.indexOf('async function boot()') + 1600);
    expect(boot).toMatch(/latest\.job\.background\) void followBackgroundJob\(selectedStore, ''\)/);
  });
});

describe('owner 2026-10-25: «I need to refresh to see the changes»', () => {
  const source = readFileSync(new URL('./source-studio.ts', import.meta.url), 'utf8');
  it('the server queues the touch only after the finished request closes, so the Studio looks again for a while before giving up', () => {
    const body = source.slice(source.indexOf('async function followBackgroundJob('), source.indexOf('async function followBackgroundJob(') + 1600);
    expect(body).toMatch(/for \(let attempt = 0; attempt < FOLLOW_ATTEMPTS/);
    expect(body).toMatch(/setTimeout\(resolve, FOLLOW_WAIT_MS\)/);
    // A follow-up that already finished while it looked still brings its revision in.
    expect(body).toMatch(/requestId !== finishedRequestId[\s\S]*await load\(\)/);
  });
});
