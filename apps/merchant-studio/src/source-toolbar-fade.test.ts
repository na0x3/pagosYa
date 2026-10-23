// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fadeWhenIdle } from './source-toolbar-fade';

afterEach(() => vi.useRealTimers());
describe('tools bar fade', () => {
  it('fades after 3 s idle and comes back on pointer, focus or a key', () => {
    vi.useFakeTimers();
    const bar = document.createElement('div'); bar.innerHTML = '<button>Código</button>'; document.body.append(bar);
    const stop = fadeWhenIdle(bar);
    vi.advanceTimersByTime(2999); expect(bar.classList.contains('is-idle')).toBe(false);
    vi.advanceTimersByTime(1); expect(bar.classList.contains('is-idle')).toBe(true);
    bar.dispatchEvent(new Event('pointerenter')); expect(bar.classList.contains('is-idle')).toBe(false);
    vi.advanceTimersByTime(3000); expect(bar.classList.contains('is-idle')).toBe(true);
    bar.querySelector('button')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); expect(bar.classList.contains('is-idle')).toBe(false);
    vi.advanceTimersByTime(3000);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); expect(bar.classList.contains('is-idle')).toBe(false);
    stop(); vi.advanceTimersByTime(5000); expect(bar.classList.contains('is-idle')).toBe(false);
  });
});
