// jsdom doesn't implement ResizeObserver (observeResize in postmessage.ts uses
// it to report iframe height to the parent page) — stub it so importing
// main.ts doesn't throw before a test even gets to make its assertions.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  writable: true,
  value: ResizeObserverStub,
});

// jsdom's own localStorage is unavailable in this environment (returns
// undefined rather than a Storage instance — an origin-gating quirk, not
// something main.ts's code is responsible for) — polyfill it with a plain
// in-memory Storage so main.ts's bare `localStorage.*` calls behave the
// same as they would in a real browser instead of throwing.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

const memoryStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { writable: true, value: memoryStorage });
Object.defineProperty(window, "localStorage", { writable: true, value: memoryStorage });

// jsdom reports every call as a not-implemented console error. Storefront
// routes deliberately control scroll restoration, so provide the browser API
// surface and let individual tests spy on it when the exact destination matters.
Object.defineProperty(window, "scrollTo", { writable: true, value: () => {} });
