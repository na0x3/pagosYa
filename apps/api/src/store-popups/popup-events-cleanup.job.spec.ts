import { PopupEventsCleanupJob } from './popup-events-cleanup.job';

describe('popup events cleanup', () => {
  it('deletes events older than 180 days', async () => {
    const deleteMany = jest.fn(async () => ({ count: 3 }));
    const job = new PopupEventsCleanupJob({ storePopupEvent: { deleteMany } } as any);
    const now = Date.UTC(2026, 10, 21);
    await expect(job.run(now)).resolves.toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date(now - 180 * 86_400_000) } } });
  });
});
