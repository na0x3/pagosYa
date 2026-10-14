import { AssistantUsage, HOURLY_LIMIT } from './assistant-usage';

const config = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] }) as any;
const now = new Date('2026-10-13T15:00:00Z');

describe('assistant usage', () => {
  it('counts only real (non-preview) conversations of this La Paz month', async () => {
    const prisma: any = { assistantConversation: { count: jest.fn().mockResolvedValue(7) } };
    await expect(new AssistantUsage(prisma, config({})).monthlyUsed('s1', now)).resolves.toBe(7);
    expect(prisma.assistantConversation.count).toHaveBeenCalledWith({ where: { storeId: 's1', preview: false, startedAt: { gte: new Date('2026-10-01T04:00:00Z') } } });
  });

  it('refuses a new conversation over the cap or the hourly limit', async () => {
    const count = jest.fn();
    const usage = new AssistantUsage({ assistantConversation: { count } } as any, config({}));
    count.mockResolvedValueOnce(300);
    await expect(usage.startGate('s1', 300, now)).resolves.toBe('cap');
    count.mockResolvedValueOnce(10).mockResolvedValueOnce(HOURLY_LIMIT);
    await expect(usage.startGate('s1', 300, now)).resolves.toBe('hourly');
    count.mockResolvedValueOnce(10).mockResolvedValueOnce(3);
    await expect(usage.startGate('s1', 300, now)).resolves.toBe('ok');
  });

  it('checks the platform spend ceiling at most once a minute', async () => {
    const $queryRaw = jest.fn().mockResolvedValue([{ micro: '49000000' }]);
    const usage = new AssistantUsage({ $queryRaw } as any, config({ 'app.assistant.monthlySpendCeilingUsd': 50 }));
    await expect(usage.spendOk(now)).resolves.toBe(true);
    await expect(usage.spendOk(new Date(now.getTime() + 30_000))).resolves.toBe(true);
    expect($queryRaw).toHaveBeenCalledTimes(1);
    $queryRaw.mockResolvedValue([{ micro: '50000001' }]);
    await expect(usage.spendOk(new Date(now.getTime() + 61_000))).resolves.toBe(false);
  });

  it('hashes IPs with the salt', () => {
    const a = new AssistantUsage({} as any, config({ 'app.assistant.ipSalt': 'one' })).ipHash('1.2.3.4');
    const b = new AssistantUsage({} as any, config({ 'app.assistant.ipSalt': 'two' })).ipHash('1.2.3.4');
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(b);
  });
});
