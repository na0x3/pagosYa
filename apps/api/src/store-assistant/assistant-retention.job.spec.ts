import { AssistantRetentionJob } from './assistant-retention.job';

const now = new Date('2026-10-13T15:00:00Z');
function setup(locked: boolean, batches: string[][] = []) {
  const findMany = jest.fn();
  batches.forEach((b) => findMany.mockResolvedValueOnce(b.map((id) => ({ id }))));
  findMany.mockResolvedValue([]);
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ locked }]),
    assistantConversation: { findMany, deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    assistantUnanswered: { deleteMany: jest.fn() },
  };
  const prisma: any = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
  return { tx, prisma, job: new AssistantRetentionJob(prisma) };
}

describe('AssistantRetentionJob', () => {
  it('does nothing when another replica holds the lock', async () => {
    const { job, tx } = setup(false);
    await job.run(now);
    expect(tx.assistantConversation.findMany).not.toHaveBeenCalled();
    expect(tx.assistantConversation.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes conversations older than 90 days in batches, with a long transaction timeout', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => `a${i}`);
    const { job, tx, prisma } = setup(true, [full, ['z1']]);
    await job.run(now);
    const cutoff = new Date(now.getTime() - 90 * 24 * 3_600_000);
    expect(tx.assistantConversation.findMany.mock.calls[0][0]).toMatchObject({ where: { lastMessageAt: { lt: cutoff } }, take: 1000 });
    expect(tx.assistantConversation.deleteMany).toHaveBeenNthCalledWith(1, { where: { id: { in: full } } });
    expect(tx.assistantConversation.deleteMany).toHaveBeenNthCalledWith(2, { where: { id: { in: ['z1'] } } });
    expect(tx.assistantConversation.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction.mock.calls[0][1]).toEqual({ timeout: 120_000 });
  });

  it('stops after 200 batches and never touches unanswered questions', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => `a${i}`);
    const { job, tx } = setup(true);
    tx.assistantConversation.findMany.mockResolvedValue(full.map((id) => ({ id })));
    await job.run(now);
    expect(tx.assistantConversation.deleteMany).toHaveBeenCalledTimes(200);
    expect(tx.assistantUnanswered.deleteMany).not.toHaveBeenCalled();
  });
});
