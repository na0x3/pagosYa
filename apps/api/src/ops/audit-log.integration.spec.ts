import { PrismaClient } from "@prisma/client";
import { integrationDatabase } from "../common/testing/integration-database";
import { AuditLogService } from "./audit-log.service";

/** ISO M-04 on real Postgres: the database chains every entry, refuses edits, and verify() finds a rewrite. */
const harness = integrationDatabase("audit_chain");

harness.describeDb("audit log hash chain (real Postgres)", () => {
  if (!harness.available) {
    harness.failIfUnavailable();
    return;
  }

  jest.setTimeout(120_000);
  let db: PrismaClient;
  let audit: AuditLogService;
  const entry = (i: number) => ({ actorType: "OPS_USER", actorId: `u${i}`, actorLabel: "Ana <ana@pagosya.bo>", action: "kyc.approved", targetType: "Merchant", targetId: `m${i}`, metadata: { i, nested: { z: 1, a: "ñ" } } });

  beforeAll(async () => {
    db = await harness.create();
    audit = new AuditLogService(db as any);
  });

  afterAll(async () => {
    await harness.drop();
  });

  it("chains concurrent writers into one line", async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => db.$transaction((tx) => audit.record(tx, entry(i)))));
    const result = await audit.verify();
    expect(result).toMatchObject({ ok: true, entries: 12, firstBrokenSeq: null });
    expect(result.head?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof (await audit.list(1))[0].seq).toBe("string");
  });

  it("refuses to edit, delete or truncate an entry", async () => {
    const [first] = await db.auditLogEntry.findMany({ orderBy: { seq: "asc" }, take: 1 });
    await expect(db.auditLogEntry.update({ where: { id: first.id }, data: { actorLabel: "Otra persona" } })).rejects.toThrow(/append-only/);
    await expect(db.auditLogEntry.delete({ where: { id: first.id } })).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe('TRUNCATE "AuditLogEntry"')).rejects.toThrow(/append-only/);
  });

  it("points at the first rewritten entry when someone goes around the triggers", async () => {
    const [, second] = await db.auditLogEntry.findMany({ orderBy: { seq: "asc" }, take: 2 });
    await db.$executeRawUnsafe('ALTER TABLE "AuditLogEntry" DISABLE TRIGGER audit_log_entry_no_update');
    await db.$executeRawUnsafe(`UPDATE "AuditLogEntry" SET "metadata" = '{"i": 99}' WHERE "id" = '${second.id}'`);
    await db.$executeRawUnsafe('ALTER TABLE "AuditLogEntry" ENABLE TRIGGER audit_log_entry_no_update');
    expect(await audit.verify()).toMatchObject({ ok: false, firstBrokenSeq: String(second.seq) });
  });
});
