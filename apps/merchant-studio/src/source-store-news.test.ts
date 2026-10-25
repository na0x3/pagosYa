// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeNews, storeNewsTicker, NEWS_EVERY_MS, NEWS_FIRST_MS, NEWS_SNOOZE_MS } from './source-store-news';
import { mountNarrator } from './source-narrator';

const paid = (id: string, amount: number, name = 'Ana Pérez', item = 'Vestido Cala') => ({ id, kind: 'PAYMENT', status: 'SUCCEEDED', amount, customerName: name, items: [{ name: item }] });

describe('store news', () => {
  it('announces one new paid order by first name, amount in Bs and product', () => {
    const [news] = storeNews({ orders: [paid('a', 680000)], seenOrderIds: [] });
    expect(news.title).toBe('¡Nueva venta!');
    expect(news.line).toMatch(/^Ana pagó Bs 6\.?800 por Vestido Cala\./);
  });

  it('sums several new orders, ignores unpaid ones and those already seen', () => {
    const orders = [paid('a', 10000), paid('b', 25000), { ...paid('c', 99900), status: 'FAILED' }, paid('d', 500)];
    const [news] = storeNews({ orders, seenOrderIds: ['d'] });
    expect(news.line).toBe('Tienes 2 pedidos nuevos desde tu última visita, por Bs 350 en total.');
  });

  it('never calls an order new on the very first visit', () => {
    expect(storeNews({ orders: [paid('a', 100)], seenOrderIds: null }).some(n => n.id.startsWith('order'))).toBe(false);
  });

  it('tells what runs low, the month, the best seller and the visits, urgent first', () => {
    const news = storeNews({
      seenOrderIds: [],
      products: [{ id: 'p', name: 'Velo', stock: 2 }, { id: 'q', name: 'Vestido Cala', stock: null }, { id: 'r', name: 'Bata', variants: [{ name: 'M', stock: 0 }, { name: 'S', stock: 9 }] }],
      finances: { paymentCount: 4, totalStoreViews: 120, monthlyProjection: { monthToDateRevenue: 1200000, projectedRevenue: 3000000 }, topProducts: [{ name: 'Velo', quantity: 3 }] },
      carts: { carts: [{}, {}] },
    });
    expect(news.map(n => n.title)).toEqual(['Por reponer', 'Carritos abandonados', 'Tus ventas del mes', 'Tu favorito', 'Visitas']);
    expect(news[0].line).toContain('Bata · M está agotado. Y 1 producto más está por acabarse.');
    expect(news[2].line).toMatch(/cerca de Bs 30\.?000/);
  });

  it('encourages a first sale when there is nothing else to tell', () => {
    expect(storeNews({ finances: { paymentCount: 0 }, seenOrderIds: [] }).map(n => n.id)).toEqual(['first-sale']);
  });
});

describe('store news ticker', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

  it('waits a little, tells one news per turn, never the same twice, and stays quiet while YAPI builds', async () => {
    const shown: string[] = []; let busy = false;
    const storage = memory();
    const ticker = storeNewsTicker({
      storeId: () => 's1', storage, busy: () => busy,
      load: async () => ({ finances: { paymentCount: 2, totalStoreViews: 10, topProducts: [{ name: 'Velo', quantity: 2 }] }, orders: [paid('a', 100)] }),
      show: item => { shown.push(item.title); return true; },
    });
    ticker.start();
    await vi.advanceTimersByTimeAsync(NEWS_FIRST_MS - 1);
    expect(shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(shown).toEqual(['Tu favorito']);
    expect(JSON.parse(storage.getItem('pagosya_yapi_news:s1')!)).toEqual(['a']);
    busy = true;
    await vi.advanceTimersByTimeAsync(NEWS_EVERY_MS);
    expect(shown).toEqual(['Tu favorito']);
    busy = false;
    await vi.advanceTimersByTimeAsync(NEWS_EVERY_MS);
    expect(shown).toEqual(['Tu favorito', 'Visitas']);
    ticker.stop();
  });

  it('a closed news window quiets YAPI for half an hour', async () => {
    const shown: string[] = [];
    let n = 0;
    const ticker = storeNewsTicker({ storeId: () => 's', storage: memory(), busy: () => false, load: async () => ({ finances: { totalStoreViews: ++n } }), show: item => { shown.push(item.id); return true; } });
    ticker.start();
    await vi.advanceTimersByTimeAsync(NEWS_FIRST_MS);
    ticker.snooze();
    await vi.advanceTimersByTimeAsync(NEWS_SNOOZE_MS - 1000);
    expect(shown.length).toBe(1);
    await vi.advanceTimersByTimeAsync(NEWS_EVERY_MS);
    expect(shown.length).toBe(2);
    ticker.stop();
  });
});

describe('YAPI window: news and the movable pill', () => {
  // Node's own (empty) localStorage shadows jsdom's here: give the window a plain in-memory one.
  let store: Map<string, string>;
  const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; store = new Map(); Object.defineProperty(window, 'localStorage', { value: localStorage, configurable: true }); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows a news line under its title, hides it by itself, and brings back the summary pill', () => {
    const n = mountNarrator(document, { reducedMotion: () => true });
    n.open('Cambia el título');
    n.show({ phase: 'done', lines: ['Listo.'] });
    vi.advanceTimersByTime(3000);
    const pill = document.querySelector<HTMLElement>('[data-narrator-pill]')!;
    expect(pill.hidden).toBe(false);
    expect(n.notice('¡Nueva venta!', 'Ana pagó Bs 100.')).toBe(true);
    expect(n.element.hidden).toBe(false);
    expect(pill.hidden).toBe(true);
    expect(document.querySelector('[data-narrator-request]')!.textContent).toBe('¡Nueva venta!');
    expect(document.querySelector('[data-narrator-text]')!.textContent).toBe('Ana pagó Bs 100.');
    vi.advanceTimersByTime(10_000);
    expect(n.element.hidden).toBe(true);
    expect(pill.hidden).toBe(false);
    pill.click();
    expect(document.querySelector('[data-narrator-text]')!.textContent).toBe('Listo.');
  });

  it('never covers YAPI at work, and closing a news line reports it', () => {
    const dismissed = vi.fn();
    const n = mountNarrator(document, { reducedMotion: () => true, onNoticeDismissed: dismissed });
    n.open('Haz algo');
    expect(n.notice('x', 'y')).toBe(false);
    n.close();
    expect(n.notice('Visitas', 'Tu tienda ya tiene 3 visitas.')).toBe(true);
    document.querySelector<HTMLButtonElement>('[data-narrator-close]')!.click();
    expect(n.element.hidden).toBe(true);
    expect(dismissed).toHaveBeenCalledOnce();
  });

  it('drags the pill on its own, remembers where, and a drag does not open the window', () => {
    const n = mountNarrator(document, { reducedMotion: () => true });
    n.open('x'); n.show({ phase: 'done', lines: ['Listo.'] });
    vi.advanceTimersByTime(3000);
    const pill = document.querySelector<HTMLElement>('[data-narrator-pill]')!;
    pill.getBoundingClientRect = () => ({ left: 900, top: 800, width: 150, height: 44, right: 1050, bottom: 844, x: 900, y: 800, toJSON() {} });
    const fire = (type: string, x: number, y: number) => pill.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }), { pointerId: 1 }));
    fire('pointerdown', 910, 810); fire('pointermove', 400, 300); fire('pointerup', 400, 300);
    pill.click();
    expect(n.element.hidden).toBe(true);
    expect(pill.style.left).toBe('390px');
    expect(JSON.parse(localStorage.getItem('pagosya_yapi_window')!)).toMatchObject({ px: 390, py: 290 });
    pill.click();
    expect(n.element.hidden).toBe(false);
  });
});
