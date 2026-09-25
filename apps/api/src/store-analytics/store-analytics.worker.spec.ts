import { StoreAnalyticsWorker } from './store-analytics.worker';

describe('StoreAnalyticsWorker', () => {
  const service = () => ({ rollup: jest.fn().mockResolvedValue({ rolled: true, rows: 3 }), prune: jest.fn().mockResolvedValue(0) });

  it('re-rolls the last 7 days after a start, then yesterday and today, and prunes at most every 6 hours', async () => {
    const analytics = service();
    let now = Date.parse('2026-09-25T12:00:00Z');
    const worker = new StoreAnalyticsWorker(analytics as never);
    worker.now = () => now;
    await worker.tick();
    now += 15 * 60_000; await worker.tick();
    now += 6 * 3_600_000; await worker.tick();
    expect(analytics.rollup.mock.calls.map(([options]) => options.days)).toEqual([7, 2, 2]);
    expect(analytics.prune).toHaveBeenCalledTimes(2);
  });

  it('never overlaps itself and never throws', async () => {
    const analytics = service();
    let finish: () => void = () => {};
    analytics.rollup.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ rolled: true, rows: 0 }); }));
    const worker = new StoreAnalyticsWorker(analytics as never);
    const first = worker.tick();
    await worker.tick();
    finish(); await first;
    expect(analytics.rollup).toHaveBeenCalledTimes(1);
    analytics.rollup.mockRejectedValueOnce(new Error('db down'));
    await expect(worker.tick()).resolves.toBeUndefined();
  });
});
