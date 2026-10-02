import { describe, expect, it } from 'vitest';
import { buildIsActive, sourceBuildTransition } from './source-build-session';
describe('durable build session', () => {
  it('distinguishes an unsent request from a job safe to reconnect or cancel', () => {
    const submitting = sourceBuildTransition({ phase: 'idle' }, { type: 'submit' });
    expect(submitting.phase).toBe('submitting');
    const running = sourceBuildTransition(submitting, { type: 'accepted', jobId: 'j1', requestId: 'r1' });
    expect(running).toEqual({ phase: 'running', jobId: 'j1', requestId: 'r1' });
    expect(sourceBuildTransition(running, { type: 'submit' })).toEqual(running);
    expect(buildIsActive(sourceBuildTransition(running, { type: 'interrupt' }))).toBe(false);
    expect(buildIsActive(sourceBuildTransition(running, { type: 'complete' }))).toBe(false);
  });
});
