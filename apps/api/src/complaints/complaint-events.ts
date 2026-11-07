import { ComplaintActor, ComplaintEventType, Prisma, PrismaClient } from "@prisma/client";

export type ComplaintEventInput = {
  type: ComplaintEventType;
  actor: ComplaintActor;
  actorId?: string | null;
  body?: string | null;
  meta?: Prisma.InputJsonValue;
};

/** The only way complaint history is written. Rows are never updated or deleted. */
export function recordComplaintEvent(db: Prisma.TransactionClient | PrismaClient, complaintId: string, event: ComplaintEventInput) {
  return db.complaintEvent.create({
    data: {
      complaintId,
      type: event.type,
      actor: event.actor,
      actorId: event.actorId ?? null,
      body: event.body ?? null,
      ...(event.meta !== undefined ? { meta: event.meta } : {}),
    },
  });
}

/** Serialises every write to one complaint: status checks then see the latest committed state (READ COMMITTED). */
export async function lockComplaint(tx: Prisma.TransactionClient, complaintId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Complaint" WHERE "id" = ${complaintId} FOR UPDATE`;
}
