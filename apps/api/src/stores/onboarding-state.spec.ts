import { StoreStatus } from "@prisma/client";
import { StoresService } from "./stores.service";

type Row = { id: string; name: string; status: StoreStatus; createdAt: number; onboarding: unknown };
const row = (id: string, createdAt: number, onboarding: unknown, status: StoreStatus = StoreStatus.ACTIVE): Row => ({ id, name: id, status, createdAt, onboarding });

// Honours the where.status filter and the createdAt orderBy, like the database would.
function serviceWith(rows: Row[]) {
  const findMany = jest.fn(async ({ where, orderBy }: any) =>
    rows.filter((r) => r.status === where.status).sort((a, b) => (orderBy.createdAt === "desc" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt)));
  return { service: new StoresService({ store: { findMany } } as any, undefined as any, undefined as any), findMany };
}
const open = { version: 1, step: 2 };
const finished = { version: 1, step: 7, finishedAt: "2026-10-11T00:00:00.000Z" };

describe("onboardingState", () => {
  it("returns { enabled:false } when the flag is off, without reading stores", async () => {
    const { service, findMany } = serviceWith([row("a", 1, open)]);
    await expect(service.onboardingState("m_1", false)).resolves.toEqual({ enabled: false, store: null });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns the newest unfinished store among several", async () => {
    const { service } = serviceWith([row("old", 1, open), row("newest", 3, open), row("mid", 2, open)]);
    const state = await service.onboardingState("m_1", true);
    expect(state).toEqual({ enabled: true, store: { id: "newest", name: "newest", onboarding: open } });
  });

  it("ignores finished and null-onboarding stores", async () => {
    const { service } = serviceWith([row("legacy", 5, null), row("done", 4, finished), row("pending", 1, open)]);
    expect((await service.onboardingState("m_1", true)).store?.id).toBe("pending");
  });

  it("returns no store when nothing is unfinished", async () => {
    const { service } = serviceWith([row("legacy", 5, null), row("done", 4, finished)]);
    await expect(service.onboardingState("m_1", true)).resolves.toEqual({ enabled: true, store: null });
  });

  it("ignores archived stores", async () => {
    const { service } = serviceWith([row("archived", 9, open, StoreStatus.ARCHIVED), row("live", 1, open)]);
    expect((await service.onboardingState("m_1", true)).store?.id).toBe("live");
  });

  it("resumes with a single unfinished store too", async () => {
    const { service } = serviceWith([row("only", 1, open)]);
    expect((await service.onboardingState("m_1", true)).store?.id).toBe("only");
  });
});

describe("listForMerchant onboarding", () => {
  it("returns only step and finishedAt, and null for stores without the walkthrough", async () => {
    const rows = [
      { id: "a", onboarding: { version: 1, step: 2, what: "private answer", photos: ["x"], done: ["name"] } },
      { id: "b", onboarding: finished },
      { id: "c", onboarding: null },
    ];
    const service = new StoresService({ store: { findMany: jest.fn(async () => rows) } } as any, undefined as any, undefined as any);
    const list = await service.listForMerchant("m_1");
    expect(list.map((s) => s.onboarding)).toEqual([
      { step: 2, finishedAt: null },
      { step: 7, finishedAt: "2026-10-11T00:00:00.000Z" },
      null,
    ]);
  });
});

describe("onboardingState with storeId", () => {
  const findFirst = (rows: Array<Row & { merchantId: string }>) => jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id && r.merchantId === where.merchantId && r.status === where.status) ?? null);
  const make = (rows: Array<Row & { merchantId: string }>) => new StoresService({ store: { findFirst: findFirst(rows), findMany: jest.fn() } } as any, undefined as any, undefined as any);
  const full = { version: 1, step: 3, what: "Café", photos: ["/v1/uploads/a.webp"] };
  const mine = (id: string, onboarding: unknown, status: StoreStatus = StoreStatus.ACTIVE) => ({ ...row(id, 1, onboarding, status), merchantId: "m_1" });

  it("returns that store's full onboarding when unfinished", async () => {
    const state = await make([mine("s1", full)]).onboardingState("m_1", true, "s1");
    expect(state).toEqual({ enabled: true, store: { id: "s1", name: "s1", onboarding: full } });
  });
  it("returns null for another merchant's store, archived, finished or never-started stores", async () => {
    const service = make([mine("s1", full), { ...mine("s2", full), merchantId: "m_2" }, mine("s3", full, StoreStatus.ARCHIVED), mine("s4", finished), mine("s5", null)]);
    for (const id of ["s2", "s3", "s4", "s5", "missing"]) expect((await service.onboardingState("m_1", true, id)).store).toBeNull();
  });
});

describe("saveOnboarding (spec 2026-10-13)", () => {
  it("keeps the showcase answers, turns the contact form on when it is the main action, and briefs a site", async () => {
    const update = jest.fn(async () => ({}));
    const prisma = { store: { findFirst: jest.fn(async () => ({ name: "deff", onboarding: { version: 1, step: 7, done: [], skipped: [] } })), update }, paymentLink: { findMany: jest.fn(async () => []) } };
    const service = new StoresService(prisma as any, undefined as any, undefined as any);
    const result: any = await service.saveOnboarding("m_1", "s_1", { step: 8, done: ["contact"], purpose: "showcase", primaryAction: { kind: "form" }, brief: true });
    expect(update).toHaveBeenCalledWith({ where: { id: "s_1" }, data: expect.objectContaining({ contactFormEnabled: true, onboarding: expect.objectContaining({ purpose: "showcase", primaryAction: { kind: "form" } }) }) });
    expect(result.brief).toContain("Crea mi sitio.");
    await service.saveOnboarding("m_1", "s_1", { primaryAction: { kind: "booking", value: "https://cal.com/deff" } });
    expect((update.mock.calls[1] as any[])[0].data).not.toHaveProperty("contactFormEnabled");
  });
});
