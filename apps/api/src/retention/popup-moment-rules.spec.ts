import { readKitFileSync } from '@pagosya/storefront-kit';
import { Script } from 'node:vm';

/** Popups 2.0 part 2 (spec 2026-11-21 §3, §7): which popup a shopper may see, decided in the browser. */
type Rules = { visitMemory: any; chooseMoment: any; markShown: any; markClosed: any; markDone: any; noteView: any; loadMemory: any; saveMemory: any };
function load(storage?: Record<string, string> | 'blocked'): Rules {
  const store = storage === 'blocked' ? null : storage ?? {};
  const localStorage = {
    getItem: (k: string) => { if (!store) throw new Error('blocked'); return k in store ? store[k] : null; },
    setItem: (k: string, v: string) => { if (!store) throw new Error('blocked'); store[k] = v; },
    removeItem: (k: string) => { if (store) delete store[k]; },
  };
  const window: any = {};
  new Script(readKitFileSync('retention.js')).runInNewContext({ window, localStorage, document: { addEventListener() {}, querySelector: () => null }, crypto: { getRandomValues: (a: Uint8Array) => a.fill(7) } });
  return window.PAGOSYA_POPUP_RULES;
}
const H = 3_600_000, D = 24 * H, T0 = Date.UTC(2026, 10, 21, 15);
const all = ['welcome', 'rescue', 'interest', 'return'];

describe('popup moment rules', () => {
  const R = load();
  const fresh = () => R.visitMemory(null, T0, 0);
  it('a first visitor gets the welcome, and only one popup in the visit', () => {
    const m = fresh();
    expect(m.visits).toBe(1);
    expect(R.chooseMoment(m, { available: all, signals: ['welcome'], cartLines: 0 }, T0)).toBe('welcome');
    R.markShown(m, 'welcome', T0);
    expect(R.chooseMoment(m, { available: all, signals: ['leave'], cartLines: 2 }, T0 + 60_000)).toBeNull();
  });
  it('rescue wins over welcome on leave with a full cart, and skips the 24 h gap in a new visit', () => {
    const m = fresh();
    expect(R.chooseMoment(m, { available: all, signals: ['leave', 'welcome'], cartLines: 1 }, T0)).toBe('rescue');
    R.markShown(m, 'welcome', T0);
    const later = R.visitMemory(m, T0 + 2 * H, 0);
    expect(later.visits).toBe(2);
    expect(R.chooseMoment(later, { available: all, signals: ['leave'], cartLines: 1 }, T0 + 2 * H)).toBe('rescue');
    expect(R.chooseMoment(later, { available: all, signals: ['interest'], cartLines: 1 }, T0 + 2 * H)).toBeNull();
  });
  it('no rescue for an empty cart, nor for a moment the store does not have', () => {
    expect(R.chooseMoment(fresh(), { available: all, signals: ['leave'], cartLines: 0 }, T0)).toBeNull();
    expect(R.chooseMoment(fresh(), { available: ['welcome'], signals: ['leave'], cartLines: 3 }, T0)).toBeNull();
  });
  it('a closed moment stays away 7 days; a completed welcome never comes back', () => {
    const m = fresh(); R.markShown(m, 'interest', T0); R.markClosed(m, 'interest', T0);
    expect(R.chooseMoment(R.visitMemory(m, T0 + 3 * D, 0), { available: all, signals: ['interest'], cartLines: 0 }, T0 + 3 * D)).toBeNull();
    expect(R.chooseMoment(R.visitMemory(m, T0 + 8 * D, 0), { available: all, signals: ['interest'], cartLines: 0 }, T0 + 8 * D)).toBe('interest');
    const w = fresh(); R.markShown(w, 'welcome', T0); R.markDone(w, 'welcome', T0);
    expect(R.chooseMoment(R.visitMemory(w, T0 + 30 * D, 0), { available: all, signals: ['welcome'], cartLines: 0 }, T0 + 30 * D)).toBeNull();
  });
  it('return needs a saved contact and a second visit; welcome never shows to a known contact', () => {
    const m = fresh(); m.contact = true;
    expect(R.chooseMoment(m, { available: all, signals: ['return', 'welcome'], cartLines: 0 }, T0)).toBeNull();
    const back = R.visitMemory(m, T0 + 2 * D, 0);
    expect(R.chooseMoment(back, { available: all, signals: ['return', 'welcome'], cartLines: 0 }, T0 + 2 * D)).toBe('return');
  });
  it('a visit ends after 30 minutes without a page view', () => {
    const m = fresh(); R.markShown(m, 'welcome', T0);
    expect(R.visitMemory(m, T0 + 29 * 60_000, 0).visitShown).toBe(true);
    expect(R.visitMemory(m, T0 + 31 * 60_000, 0).visitShown).toBe(false);
  });
  it('three different products of one category in a visit make an interest signal', () => {
    const m = fresh();
    expect(R.noteView(m, { id: 'p1', categoryId: 'c1' })).toBe(false);
    expect(R.noteView(m, { id: 'p1', categoryId: 'c1' })).toBe(false);
    expect(R.noteView(m, { id: 'p2', categoryId: 'c1' })).toBe(false);
    expect(R.noteView(m, { id: 'p3', categoryId: 'c1' })).toBe(true);
    expect(R.noteView(m, { id: 'p9', categoryId: '' })).toBe(false);
  });
  it('upgrade from the old key: a popup seen last week counts as the welcome done', () => {
    const m = R.visitMemory(null, T0, T0 - 7 * D);
    expect(m.lastShownAt).toBe(T0 - 7 * D);
    expect(R.chooseMoment(m, { available: all, signals: ['welcome'], cartLines: 0 }, T0)).toBeNull();
    expect(R.chooseMoment(m, { available: all, signals: ['interest'], cartLines: 0 }, T0)).toBe('interest');
  });
  it('blocked storage: load gives nothing, save never throws', () => {
    const blocked = load('blocked');
    expect(blocked.loadMemory('calima')).toBeNull();
    expect(() => blocked.saveMemory('calima', blocked.visitMemory(null, T0, 0))).not.toThrow();
  });
  it('memory round-trips through localStorage per store', () => {
    const storage: Record<string, string> = {}; const r = load(storage);
    const m = r.visitMemory(null, T0, 0); m.code = 'POPABC234'; r.saveMemory('calima', m);
    expect(JSON.parse(storage['pagosya:popups:calima']).code).toBe('POPABC234');
    expect(r.loadMemory('calima').code).toBe('POPABC234');
  });
});
