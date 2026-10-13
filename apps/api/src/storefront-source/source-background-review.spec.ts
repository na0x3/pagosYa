// Spec 2026-10-12 faster generation, part 2: the review's bookkeeping (in-process registry, pending flag, cancel route).
import { NotFoundException } from '@nestjs/common';
import { SOURCE_REVIEW_LABEL, SOURCE_REVIEW_STALE_MS, SourceReviewRegistry, reviewMessage, reviewPendingWhere } from './source-background-review';
import { SourceGenerationService } from './source-generation.service';
import { SourceProjectsController } from './source-projects.controller';

describe('SourceReviewRegistry', () => {
  it('runs one review per store: a new one aborts the old, cancel aborts, settled waits for the end', async () => {
    const registry = new SourceReviewRegistry();
    const seen: AbortSignal[] = [];
    const work = (signal: AbortSignal) => { seen.push(signal); return new Promise<void>(resolve => signal.addEventListener('abort', () => resolve())); };
    void registry.start('s1', work);
    void registry.start('s1', work);
    expect(seen[0].aborted).toBe(true);
    expect(seen[1].aborted).toBe(false);
    expect(registry.cancel('s2')).toBe(false);
    expect(registry.cancel('s1')).toBe(true);
    await registry.settled('s1');
    expect(seen[1].aborted).toBe(true);
    expect(registry.cancel('s1')).toBe(false);
  });

  it('never lets a failing review reject its caller', async () => {
    const registry = new SourceReviewRegistry();
    await expect(registry.start('s1', async () => { throw new Error('boom'); })).resolves.toBeUndefined();
  });
});

it('says what YAPI polished, in its own words, or names the version when it has none', () => {
  expect(reviewMessage(['Agrandé el título.', ' ', 'Oscurecí el texto.'], 'Café pulido')).toBe('Pulí tu tienda: Agrandé el título. Oscurecí el texto.');
  expect(reviewMessage([], 'Café pulido')).toBe('Pulí tu tienda: «Café pulido».');
  expect(SOURCE_REVIEW_LABEL).toBe('Revisión de YAPI');
});

describe('review state on the service', () => {
  const setup = () => {
    const prisma: any = { storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    return { prisma, service: new SourceGenerationService(prisma, {} as any, {} as any, {} as any, { get: () => undefined } as any) };
  };

  it('treats a review whose heartbeat stopped more than 5 minutes ago as not pending, and retires such rows on cancel', async () => {
    const now = Date.parse('2026-10-12T12:00:00Z');
    expect(reviewPendingWhere('s1', 3, now)).toEqual({ storeId: 's1', status: 'REVIEWING', baseRevision: 3, heartbeatAt: { gt: new Date(now - SOURCE_REVIEW_STALE_MS) } });
    expect(SOURCE_REVIEW_STALE_MS).toBe(5 * 60_000);
    const { prisma, service } = setup();
    expect(await service.reviewPending('s1', 3)).toBe(false);
    const where = prisma.storeSourceGeneration.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ storeId: 's1', status: 'REVIEWING', baseRevision: 3 });
    expect(Math.abs(where.heartbeatAt.gt.getTime() - (Date.now() - SOURCE_REVIEW_STALE_MS))).toBeLessThan(2_000);
    prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'review-1' });
    expect(await service.reviewPending('s1', 3)).toBe(true);
    expect(await service.reviewPending('s1', 0)).toBe(false);
    expect(prisma.storeSourceGeneration.findFirst).toHaveBeenCalledTimes(2);
    // Nothing runs in this process (the review's process restarted): the row is still retired.
    expect(await service.cancelReview('s1')).toBe(false);
    expect(prisma.storeSourceGeneration.updateMany).toHaveBeenCalledWith({ where: { storeId: 's1', status: 'REVIEWING' }, data: { status: 'CANCELLED', completedAt: expect.any(Date) } });
  });

  it('aborts the review running in this process, and never throws when the database is unavailable', async () => {
    const { prisma, service } = setup();
    let signal!: AbortSignal;
    void (service as any).reviews.start('s1', (given: AbortSignal) => { signal = given; return new Promise<void>(resolve => given.addEventListener('abort', () => resolve())); });
    prisma.storeSourceGeneration.updateMany.mockRejectedValueOnce(new Error('db down'));
    expect(await service.cancelReview('s1')).toBe(true);
    await service.reviewSettled('s1');
    expect(signal.aborted).toBe(true);
    prisma.storeSourceGeneration.findFirst.mockRejectedValueOnce(new Error('db down'));
    expect(await service.reviewPending('s1', 3)).toBe(false);
  });
});

it('adds reviewPending to the store state and cancels a review only for the store owner', async () => {
  const projects: any = { state: jest.fn().mockResolvedValue({ revision: 3, versions: [], nextBefore: null }), current: jest.fn().mockResolvedValue({ revision: 3 }) };
  const generation: any = { reviewPending: jest.fn().mockResolvedValue(true), cancelReview: jest.fn().mockResolvedValue(true) };
  const controller = new SourceProjectsController(projects, generation, {} as any);
  expect(await controller.state({ id: 'm1' }, 's1')).toMatchObject({ revision: 3, reviewPending: true });
  expect(generation.reviewPending).toHaveBeenCalledWith('s1', 3);
  expect(await controller.cancelReview({ id: 'm1' }, 's1')).toEqual({ cancelled: true });
  expect(projects.current).toHaveBeenCalledWith('m1', 's1');
  projects.current.mockRejectedValueOnce(new NotFoundException('Store not found'));
  await expect(controller.cancelReview({ id: 'other' }, 's1')).rejects.toThrow('Store not found');
  expect(generation.cancelReview).toHaveBeenCalledTimes(1);
});
