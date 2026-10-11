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
