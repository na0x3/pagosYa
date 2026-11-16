import { mergeKept, visitorSelling, type SellingSwitches } from './selling-rules';

type Db = {
  storeSellingChange: { findMany(args: unknown): Promise<Array<{ kind: string; status: string; settings: unknown; endedAt: Date | null }>>; updateMany(args: unknown): Promise<unknown> };
  storeSourceExperiment: { updateMany(args: unknown): Promise<{ count: number }> };
};

/** The selling switches one visitor of a published store gets (spec 2026-11-16): the kept ones, plus side B's during a selling test. */
export async function sellingForVisitor(prisma: Db, storeId: string, experiment: { kind: string; variantSettings: unknown } | null, variant: string | undefined): Promise<SellingSwitches> {
  let kept: Awaited<ReturnType<Db['storeSellingChange']['findMany']>> = [];
  try { kept = await prisma.storeSellingChange.findMany({ where: { storeId, status: 'KEPT' }, select: { kind: true, status: true, settings: true, endedAt: true } }); } catch { kept = []; }
  return visitorSelling(mergeKept(kept), experiment, variant);
}

/** Ends a running selling test without keeping it (the merchant started their own test, switched auto-improve off, or pressed undo). */
export async function stopSellingTest(prisma: Db, experimentId: string, why: string) {
  const now = new Date();
  await prisma.storeSourceExperiment.updateMany({ where: { id: experimentId, kind: 'selling', status: 'RUNNING' }, data: { status: 'STOPPED', activeStoreId: null, endedAt: now } });
  await prisma.storeSellingChange.updateMany({ where: { experimentId, status: 'TRYING' }, data: { status: 'UNDONE', endedAt: now, evidence: { why } } });
}
