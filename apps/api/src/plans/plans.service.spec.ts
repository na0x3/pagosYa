import { ForbiddenException, HttpException } from '@nestjs/common';
import { PlansService } from './plans.service';
import { CREDITS_EXHAUSTED, PLAN_REQUIRED } from './plans';

const NOW = new Date('2026-11-07T16:00:00Z');
function service(opts: { plan?: 'FREE' | 'EMPRENDEDOR' | 'PRO'; spentMicroUsd?: number; granted?: number; unmetered?: boolean; storeMerchant?: string | null; sentEmails?: number } = {}) {
  const prisma: any = {
    merchant: { findUnique: jest.fn(async () => ({ plan: opts.plan ?? 'FREE' })), update: jest.fn(async ({ data }: any) => ({ id: 'm1', plan: data.plan })) },
    store: {
      findFirst: jest.fn(async ({ where }: any) => opts.storeMerchant === null || (where.merchantId && where.merchantId !== (opts.storeMerchant ?? 'm1')) ? null : { merchantId: opts.storeMerchant ?? 'm1' }),
      findUnique: jest.fn(async () => ({ merchantId: 'm1', merchant: { plan: opts.plan ?? 'FREE' } })),
    },
    merchantCreditGrant: { aggregate: jest.fn(async () => ({ _sum: { credits: opts.granted ?? null } })), create: jest.fn(async ({ data }: any) => ({ id: 'g1', ...data })) },
    auditLogEntry: { create: jest.fn(async () => ({})) },
    storeEmailDelivery: { count: jest.fn(async () => opts.sentEmails ?? 0) },
    $queryRaw: jest.fn(async () => [{ micro: String(opts.spentMicroUsd ?? 0) }]),
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const config: any = { get: (key: string) => key === 'app.chatgptPlan' ? (opts.unmetered ? { url: 'x' } : undefined) : undefined };
  return { plans: new PlansService(prisma, config), prisma };
}
const caught = async (promise: Promise<unknown>) => { try { await promise; return null; } catch (error) { return error as HttpException; } };

describe('PlansService', () => {
  it('sums the month: plan credits + grants − what the AI calls cost (1 credit = US$0.01)', async () => {
    const { plans } = service({ plan: 'FREE', spentMicroUsd: 1_234_000, granted: 50 });
    const summary = await plans.summary('m1', NOW);
    expect(summary).toMatchObject({ monthlyCredits: 300, extraCredits: 50, usedCredits: 124, remainingCredits: 226, enforced: true, month: '2026-11' });
    expect(summary.renewsAt).toBe('2026-12-01T04:00:00.000Z');
  });

  it('refuses YAPI once the month is used up, with the renewal day and a code the Studio reads', async () => {
    const { plans } = service({ plan: 'FREE', spentMicroUsd: 3_000_000 });
    const error = await caught(plans.assertCredits('s1', 'm1', NOW));
    expect(error?.getStatus()).toBe(402);
    expect(error?.getResponse()).toMatchObject({ code: CREDITS_EXHAUSTED, message: expect.stringContaining('Se renuevan el 1 de diciembre') });
    await expect(service({ plan: 'EMPRENDEDOR', spentMicroUsd: 3_000_000 }).plans.assertCredits('s1', 'm1', NOW)).resolves.toBe(1200);
  });

  it('never blocks on the merchant’s own ChatGPT plan (dev), and hides other merchants’ stores', async () => {
    await expect(service({ spentMicroUsd: 99_000_000, unmetered: true }).plans.assertCredits('s1', 'm1', NOW)).resolves.toBe(Infinity);
    const error = await caught(service({ storeMerchant: 'm2' }).plans.assertCredits('s1', 'm1', NOW));
    expect(error?.getStatus()).toBe(404);
  });

  it('lets only paid plans publish', async () => {
    const error = await caught(service({ plan: 'FREE' }).plans.assertCanPublish('m1'));
    expect(error?.getStatus()).toBe(402);
    expect(error?.getResponse()).toMatchObject({ code: PLAN_REQUIRED });
    await expect(service({ plan: 'EMPRENDEDOR' }).plans.assertCanPublish('m1')).resolves.toBeUndefined();
    await expect(service({ plan: 'PRO' }).plans.assertCanPublish('m1')).resolves.toBeUndefined();
  });

  it('keeps a domain of its own and the month’s promotional emails to the plan', async () => {
    expect((await caught(service({ plan: 'FREE' }).plans.assertCustomDomain('m1')))?.getResponse()).toMatchObject({ code: PLAN_REQUIRED });
    await expect(service({ plan: 'EMPRENDEDOR' }).plans.assertCustomDomain('m1')).resolves.toBeUndefined();
    await expect(service({ plan: 'EMPRENDEDOR', sentEmails: 1990 }).plans.emailsLeft('s1', NOW)).resolves.toMatchObject({ sent: 1990, left: 10 });
    await expect(service({ plan: 'EMPRENDEDOR', sentEmails: 2500 }).plans.emailsLeft('s1', NOW)).resolves.toMatchObject({ left: 0 });
  });

  it('gives the assistant the plan’s conversations, or the store’s own higher cap', async () => {
    await expect(service({ plan: 'EMPRENDEDOR' }).plans.assistantCap('s1', 300)).resolves.toBe(1000);
    await expect(service({ plan: 'PRO' }).plans.assistantCap('s1', 5000)).resolves.toBe(5000);
  });

  it('changes plans and grants credits for admins only, with an audit entry', async () => {
    const admin = { id: 'o1', name: 'Ana', email: 'ana@pagosya.test', role: 'SUPPORT_ADMIN' as const };
    const agent = { ...admin, role: 'SUPPORT_AGENT' as const };
    const { plans, prisma } = service({ plan: 'FREE' });
    await expect(plans.setPlan('m1', 'PRO', admin as never)).resolves.toEqual({ id: 'm1', plan: 'PRO' });
    await expect(plans.grantCredits('m1', 200, 'Compensación', admin as never, NOW)).resolves.toMatchObject({ month: '2026-11', credits: 200 });
    expect(prisma.auditLogEntry.create).toHaveBeenCalledTimes(2);
    expect(await caught(plans.setPlan('m1', 'PRO', agent as never))).toBeInstanceOf(ForbiddenException);
  });
});
