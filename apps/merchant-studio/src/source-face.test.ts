// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mountFace, FACE_MOODS, FACE_EARNED, FACE_REACTION_MS, renderFace } from './source-face';

function mount(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener() {}, removeEventListener() {},
  }));
  const host = document.createElement('div');
  host.innerHTML = renderFace();
  document.body.append(host);
  return { host, face: mountFace(host), figure: host.querySelector<HTMLElement>('[data-face]')! };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('the ambient rhythm', () => {
  it('never plays a gesture that answers to the merchant', () => {
    // A hop on a clock is spent on nobody. Guard the separation so a later edit
    // cannot quietly move the earned gesture into the loop.
    for (const earned of FACE_EARNED) expect(FACE_MOODS).not.toContain(earned);
  });

  it('keeps a quiet beat between expressive ones', () => {
    const expressive = FACE_MOODS.map(m => m !== 'idle');
    expect(expressive.some((loud, i) => loud && expressive[i + 1])).toBe(true);
    expect(FACE_MOODS.filter(m => m === 'idle').length).toBeGreaterThanOrEqual(FACE_MOODS.length / 3);
  });
});

describe('reacting', () => {
  it('plays the gesture now and hands the face back to its rhythm', () => {
    const { face, figure } = mount(false);
    face.react('hop');
    expect(figure.dataset.mood).toBe('hop');
    vi.advanceTimersByTime(FACE_REACTION_MS);
    expect(figure.dataset.mood).toBe('idle');
    face.destroy();
  });

  it('drops body movement under reduced motion but keeps the shimmer', () => {
    const { face, figure } = mount(true);
    face.react('hop');
    expect(figure.dataset.mood).toBe('idle');
    face.react('spin');
    expect(figure.dataset.mood).toBe('idle');
    face.react('spark');
    expect(figure.dataset.mood).toBe('spark');
    face.destroy();
  });

  it('leaves no timer behind after teardown', () => {
    const { face, figure } = mount(false);
    face.react('hop');
    face.destroy();
    vi.advanceTimersByTime(FACE_REACTION_MS * 3);
    expect(figure.dataset.mood).toBe('hop');
  });
});
