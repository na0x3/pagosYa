import { SupportCaseCategory, SupportCasePriority, SupportCaseStatus } from "@prisma/client";

type SupportCaseClient = {
  supportCase: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<{ id: string }>;
  };
};

/**
 * Opens a support case for ops when money moved (or may have moved) in a way
 * the system could not apply on its own. Like the domain-order escalations,
 * the case is linked by text in its summary; `dedupeKey` must appear in the
 * summary so a repeated escalation finds the still-open case instead of
 * opening another.
 */
export async function openOpsCaseOnce(
  prisma: SupportCaseClient,
  input: { merchantId: string; dedupeKey: string; summary: string; category?: SupportCaseCategory; priority?: SupportCasePriority },
): Promise<{ id: string; created: boolean }> {
  if (!input.summary.includes(input.dedupeKey)) throw new Error("The case summary must contain its dedupe key");
  const existing = await prisma.supportCase.findFirst({
    where: { summary: { contains: input.dedupeKey }, status: { not: SupportCaseStatus.RESOLVED } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };
  const created = await prisma.supportCase.create({
    data: {
      merchantId: input.merchantId,
      category: input.category ?? SupportCaseCategory.PAYMENTS,
      priority: input.priority ?? SupportCasePriority.HIGH,
      summary: input.summary,
    },
  });
  return { id: created.id, created: true };
}
