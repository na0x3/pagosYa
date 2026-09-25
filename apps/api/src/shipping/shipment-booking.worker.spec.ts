import { ShipmentBookingWorker } from './shipment-booking.worker';

describe('ShipmentBookingWorker', () => {
  it('books only armed, due BOOKING shipments, oldest first, 20 at a time', async () => {
    const findMany = jest.fn(async () => [{ id: 'a' }, { id: 'b' }]);
    const book = jest.fn(async (_id: string) => undefined);
    const worker = new ShipmentBookingWorker({ shipment: { findMany } } as any, { book } as any);
    await expect(worker.tick()).resolves.toBe(2);
    expect(findMany).toHaveBeenCalledWith({ where: { status: 'BOOKING', nextAttemptAt: { lte: expect.any(Date) } }, orderBy: { nextAttemptAt: 'asc' }, take: 20, select: { id: true } });
    expect(book.mock.calls.map(c => c[0])).toEqual(['a', 'b']);
  });
  it('does not overlap runs', async () => {
    let release!: () => void;
    const book = jest.fn(() => new Promise<void>(r => { release = r; }));
    const worker = new ShipmentBookingWorker({ shipment: { findMany: async () => [{ id: 'a' }] } } as any, { book } as any);
    const first = worker.tick();
    await new Promise(r => setImmediate(r));
    await expect(worker.tick()).resolves.toBe(0);
    release(); await first;
  });
  it('keeps booking the rest of the tick when one shipment throws (even a non-Error)', async () => {
    // Non-Error throws are the point of this test: the worker must survive them.
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  const book = jest.fn(async (id: string) => { if (id === 'a') throw Object.assign(Object.create(null), { circular: true }); if (id === 'b') throw null; });
    const worker = new ShipmentBookingWorker({ shipment: { findMany: async () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } } as any, { book } as any);
    await expect(worker.tick()).resolves.toBe(3);
    expect(book.mock.calls.map(c => c[0])).toEqual(['a', 'b', 'c']);
  });
  it('run() never rejects, even on a nullish failure', async () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
  const worker = new ShipmentBookingWorker({ shipment: { findMany: async () => { throw undefined; } } } as any, { book: jest.fn() } as any);
    await expect(worker.run()).resolves.toBeUndefined();
  });
});
