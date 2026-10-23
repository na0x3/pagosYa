import { describe, expect, it } from 'vitest';
import { loadPlace, nudge, placePill, savePlace, spinState } from './source-yapi-pill';

const pill = { width: 560, height: 64 };
const desk = { width: 1440, height: 900 };

describe('pill placement', () => {
  it('sits bottom centre by default and docks full width on a phone', () => {
    expect(placePill(null, pill, desk)).toEqual({ left: 440, top: 812, docked: false });
    expect(placePill({ x: 300, y: 200 }, pill, { width: 390, height: 800 })).toMatchObject({ left: 0, docked: true });
  });
  it('stays fully on screen when the window shrinks', () => {
    expect(placePill({ x: 1300, y: 880 }, pill, { width: 1000, height: 600 })).toEqual({ left: 432, top: 528, docked: false });
  });
  it('arrow keys move it 10px from where it is', () => {
    expect(nudge(null, 'ArrowUp', pill, desk)).toEqual({ x: 440, y: 802 });
    expect(nudge({ x: 100, y: 100 }, 'ArrowRight', pill, desk)).toEqual({ x: 110, y: 100 });
    expect(nudge({ x: 100, y: 100 }, 'Enter', pill, desk)).toEqual({ x: 100, y: 100 });
  });
  it('saved places survive a reload and blocked storage never throws', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
    savePlace(storage, { x: 12, y: 34 });
    expect(loadPlace(storage)).toEqual({ x: 12, y: 34 });
    savePlace(storage, null);
    expect(loadPlace(storage)).toBeNull();
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    expect(loadPlace(blocked)).toBeNull();
    expect(() => savePlace(blocked, { x: 1, y: 2 })).not.toThrow();
    map.set('pagosya_yapi_pill', 'not json');
    expect(loadPlace(storage)).toBeNull();
  });
});

describe('the star', () => {
  it('turns while YAPI changes something, pulses with reduced motion, rests otherwise', () => {
    expect(spinState({ building: true, followingOwnRequest: false, reducedMotion: false })).toBe('spin');
    expect(spinState({ building: false, followingOwnRequest: true, reducedMotion: false })).toBe('spin');
    expect(spinState({ building: true, followingOwnRequest: false, reducedMotion: true })).toBe('pulse');
    expect(spinState({ building: false, followingOwnRequest: false, reducedMotion: false })).toBe('idle');
  });
});
