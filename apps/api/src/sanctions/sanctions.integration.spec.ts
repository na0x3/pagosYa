import { KycScreeningStatus, KycStatus, PrismaClient } from "@prisma/client";
import { integrationDatabase } from "../common/testing/integration-database";
import { AuditLogService } from "../ops/audit-log.service";
import { SanctionsService } from "./sanctions.service";
import { OFAC_ALT_URL, OFAC_SDN_URL, UN_LIST_URL } from "./sanctions-lists";
import { ALT_FIXTURE, SDN_FIXTURE, UN_FIXTURE } from "./sanctions-fixtures";

/** Sanctions screening on real Postgres: import, screen at KYC, block approval, decide, and re-screen after a list change. */
const harness = integrationDatabase("sanctions");

harness.describeDb("sanctions screening (real Postgres)", () => {
  if (!harness.available) {
    harness.failIfUnavailable();
    return;
  }

  jest.setTimeout(120_000);
  let db: PrismaClient;
  let sanctions: SanctionsService;
  let files: Record<string, string>;
  const ops = { id: "ops_1", name: "Ana", email: "ana@pagosya.bo" };
  let n = 0;

  beforeAll(async () => {
    db = await harness.create();
    sanctions = new SanctionsService(db as any, new AuditLogService(db as any), { get: (key: string) => (key === "app.sanctionsScreeningRequired" ? true : undefined) } as any);
    files = { [UN_LIST_URL]: UN_FIXTURE, [OFAC_SDN_URL]: SDN_FIXTURE, [OFAC_ALT_URL]: ALT_FIXTURE };
    sanctions.fetcher = async (url) => files[url];
    sanctions.minimumEntries = { UN: 1, OFAC: 1 };
  });

  afterAll(async () => {
    await harness.drop();
  });

  async function submission(legalName: string, status: KycStatus = KycStatus.PENDING_REVIEW) {
    n += 1;
    const merchant = await db.merchant.create({ data: { name: `Tienda ${n}`, email: `t${n}-${harness.databaseName}@test.test` } });
    return db.merchantKycSubmission.create({ data: { merchantId: merchant.id, legalName, legalRepName: legalName, payoutBankAccount: "BNB 1", status, targetLevel: 1 } });
  }

  it("without lists, approval waits for a real screening where screening is required", async () => {
    const pending = await submission("Ana Pérez");
    await expect(sanctions.screenSubmission(pending.id)).resolves.toMatchObject({ status: KycScreeningStatus.NOT_SCREENED });
    await expect(sanctions.approvalBlocker(pending.id)).resolves.toMatch(/Falta revisar/);
  });

  it("imports both lists once, and the next import of the same files changes nothing", async () => {
    const first = await sanctions.importLists();
    expect(first.imported).toEqual([{ source: "UN", entries: 3, changed: true }, { source: "OFAC", entries: 2, changed: true }]);
    expect(await db.sanctionsEntry.count()).toBe(5);
    const again = await sanctions.importLists();
    expect(again.imported.every((list) => !list.changed)).toBe(true);
    expect(await db.sanctionsListImport.count()).toBe(2);
  });

  it("clears an ordinary name and blocks a listed one until ops decide", async () => {
    const clear = await submission("Rosa Quispe Mamani");
    expect((await sanctions.screenSubmission(clear.id)).status).toBe(KycScreeningStatus.CLEAR);
    await expect(sanctions.approvalBlocker(clear.id)).resolves.toBeNull();

    const listed = await submission("Éric Badège");
    const screening = await sanctions.screenSubmission(listed.id);
    expect(screening.status).toBe(KycScreeningStatus.POSSIBLE_MATCH);
    expect((screening.matches as any[])[0]).toMatchObject({ source: "UN", primaryName: "ERIC BADEGE", birthDates: ["1971"] });
    expect((screening.listImports as any[]).map((l) => l.source).sort()).toEqual(["OFAC", "UN"]);
    await expect(sanctions.approvalBlocker(listed.id)).resolves.toMatch(/posible coincidencia/);

    await expect(sanctions.resolve(screening.id, "DISMISSED", "corta", ops)).rejects.toThrow(/Explica/);
    await sanctions.resolve(screening.id, "DISMISSED", "CI boliviano, nacida en 1994: no es la persona listada", ops);
    await expect(sanctions.approvalBlocker(listed.id)).resolves.toBeNull();
    const audit = await db.auditLogEntry.findFirst({ where: { action: "sanctions.match_dismissed" } });
    expect(audit).toMatchObject({ targetId: listed.id, actorId: "ops_1" });
  });

  it("a confirmed match can never be approved", async () => {
    const listed = await submission("Abu Abbas");
    const screening = await sanctions.screenSubmission(listed.id);
    await sanctions.resolve(screening.id, "CONFIRMED", "Misma fecha de nacimiento y nacionalidad que la lista OFAC", ops);
    await expect(sanctions.approvalBlocker(listed.id)).resolves.toMatch(/confirmada/);
  });

  it("after a list change, flags an approved merchant newly on it, once", async () => {
    const approved = await submission("Carla Montaño Rojas", KycStatus.APPROVED);
    files[UN_LIST_URL] = UN_FIXTURE.replace("</INDIVIDUALS>", "<INDIVIDUAL><DATAID>7000001</DATAID><FIRST_NAME>CARLA</FIRST_NAME><SECOND_NAME>MONTANO ROJAS</SECOND_NAME><UN_LIST_TYPE>TEST</UN_LIST_TYPE></INDIVIDUAL></INDIVIDUALS>");
    const result = await sanctions.importLists();
    expect(result.imported.find((l) => l.source === "UN")).toMatchObject({ entries: 4, changed: true });
    expect(result.rescreened).toBe(1);
    const flagged = await db.kycScreening.findFirst({ where: { submissionId: approved.id }, orderBy: { createdAt: "desc" } });
    expect(flagged).toMatchObject({ status: KycScreeningStatus.POSSIBLE_MATCH, trigger: "list_update" });
    // The same list again: nothing new to flag.
    files[UN_LIST_URL] += " ";
    expect((await sanctions.importLists()).rescreened).toBe(0);
  });

  it("refuses a download that looks truncated and keeps the lists it has", async () => {
    sanctions.minimumEntries = { UN: 50, OFAC: 1 };
    await expect(sanctions.importLists()).rejects.toThrow(/incomplete/);
    expect(await db.sanctionsEntry.count({ where: { source: "UN" } })).toBe(4);
  });
});
