import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { StoresService } from "./stores.service";
import { VisualStudioService } from "./visual-studio.service";

function setup() {
  let row: any = { id: "store-1", merchantId: "merchant-1", name: "Public name", tagline: "Public title", siteDocument: null,
    websiteRevision: 0, websitePublishedRevision: 0, websiteDraft: null, links: [{ label: "Public", url: "https://example.com" }] };
  let versions: any[] = [];
  const prisma: any = {
    store: {
      findFirst: jest.fn(async ({ where }) => where.id === row.id && where.merchantId === row.merchantId ? structuredClone(row) : null),
      findUniqueOrThrow: jest.fn(async () => structuredClone(row)),
      update: jest.fn(),
      updateMany: jest.fn(async ({ where, data }) => {
        if (where.id !== row.id || where.merchantId !== row.merchantId || where.websiteRevision !== row.websiteRevision) return { count: 0 };
        for (const [key, value] of Object.entries(data)) row[key] = value === Prisma.DbNull ? null : (value as any)?.increment ? row[key] + (value as any).increment : structuredClone(value);
        return { count: 1 };
      }),
    },
    storeLink: {
      deleteMany: jest.fn(async () => { row.links = []; }),
      createMany: jest.fn(async ({ data }) => { row.links = data; }),
    },
    storeVisualVersion: { create: jest.fn(async ({ data }) => { versions.push(data); return data; }), findFirst: jest.fn() },
    storeVisualProposal: { findFirst: jest.fn() },
    mediaAsset: { findMany: jest.fn(async () => []) },
    paymentLink: { findMany: jest.fn(async () => []), updateMany: jest.fn(async () => ({ count: 1 })) },
  };
  prisma.$transaction = async (work: (tx: any) => unknown) => {
    const before = structuredClone(row); const oldVersions = structuredClone(versions);
    try { return await work(prisma); } catch (error) { row = before; versions = oldVersions; throw error; }
  };
  const stores = new StoresService(prisma, {} as never, {} as never);
  const visual = new VisualStudioService(prisma, {} as never, { get: () => undefined } as never, {} as never);
  return { prisma, stores, visual, read: () => structuredClone(row), versions: () => structuredClone(versions) };
}

describe("Private website drafts", () => {
  it("persists manual edits and link order privately and promotes only the reviewed revision", async () => {
    const { stores, read, versions } = setup();
    const saved = await stores.saveWebsiteDraft("merchant-1", "store-1", { revision: 0, name: "Private name", tagline: "Private title", links: [{ label: "New", url: "https://example.com/new" }] });
    expect(saved.name).toBe("Private name");
    expect(saved.websiteRevision).toBe(1);
    expect(read()).toMatchObject({ name: "Public name", tagline: "Public title", links: [{ label: "Public" }], websiteDraft: { data: { name: "Private name" } } });
    await expect(stores.publishWebsiteDraft("merchant-1", "store-1", 0)).rejects.toBeInstanceOf(ConflictException);
    const published = await stores.publishWebsiteDraft("merchant-1", "store-1", 1);
    expect(published).toMatchObject({ name: "Private name", tagline: "Private title", websiteDraft: null, websiteRevision: 2, websitePublishedRevision: 1, links: [{ label: "New" }] });
    expect(versions()[0].snapshot).toMatchObject({ name: "Public name", tagline: "Public title", links: [{ label: "Public" }] });
  });

  it("rejects a stale tab and a different merchant without changing the accepted draft", async () => {
    const { stores, read } = setup();
    await stores.saveWebsiteDraft("merchant-1", "store-1", { revision: 0, tagline: "Accepted", links: [] });
    await expect(stores.saveWebsiteDraft("merchant-1", "store-1", { revision: 0, tagline: "Stale", links: [] })).rejects.toBeInstanceOf(ConflictException);
    await expect(stores.saveWebsiteDraft("other", "store-1", { revision: 1, tagline: "Foreign", links: [] })).rejects.toThrow("Store not found");
    expect(read().websiteDraft.data.tagline).toBe("Accepted");
    expect(read().tagline).toBe("Public title");
  });

  it("detects a save race at the conditional database write", async () => {
    const { prisma, stores, read } = setup();
    prisma.store.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(stores.saveWebsiteDraft("merchant-1", "store-1", { revision: 0, tagline: "Late", links: [] })).rejects.toBeInstanceOf(ConflictException);
    expect(read().websiteDraft).toBeNull();
  });

  it("keeps public fields intact when using an AI proposal and rejects a late proposal", async () => {
    const { prisma, visual, read } = setup();
    prisma.storeVisualProposal.findFirst.mockResolvedValue({ id: "proposal-1", title: "Proposal", baseWebsiteRevision: 0, config: { tagline: "AI title" } });
    const used = await visual.apply("merchant-1", "store-1", "proposal-1", 0);
    expect(used.tagline).toBe("AI title");
    expect(read().tagline).toBe("Public title");
    expect(prisma.store.update).not.toHaveBeenCalled();
    await expect(visual.apply("merchant-1", "store-1", "proposal-1", 1)).rejects.toThrow("borrador anterior");
  });

  it("restores a published version privately including its name and links", async () => {
    const { prisma, visual, read } = setup();
    prisma.storeVisualVersion.findFirst.mockResolvedValue({ id: "v1", source: "publish:4", snapshot: { name: "Earlier", tagline: "Earlier title", links: [{ label: "Earlier", url: "https://example.com/earlier" }] } });
    await visual.restore("merchant-1", "store-1", "v1", 0);
    expect(read().name).toBe("Public name");
    expect(read().websiteDraft).toMatchObject({ data: { name: "Earlier" }, links: [{ label: "Earlier" }] });
  });

  it("rolls back publication if link persistence fails", async () => {
    const { prisma, stores, read, versions } = setup();
    await stores.saveWebsiteDraft("merchant-1", "store-1", { revision: 0, tagline: "Private", links: [] });
    prisma.storeLink.createMany.mockRejectedValueOnce(new Error("connection lost"));
    await expect(stores.publishWebsiteDraft("merchant-1", "store-1", 1)).rejects.toThrow("connection lost");
    expect(read()).toMatchObject({ tagline: "Public title", websiteRevision: 1, websiteDraft: { data: { tagline: "Private" } } });
    expect(versions()).toEqual([]);
  });

  it("does not interpret stock values in an appearance form as stock edits", async () => {
    const { prisma, stores, read } = setup();
    const locations = [{ id: "centro", name: "Centro", pickupEnabled: true, deliveryEnabled: false, openingHours: [], inventory: [{ paymentLinkId: "p1", stock: 20 }] }];
    await stores.saveWebsiteDraft("merchant-1", "store-1", { revision: 0, tagline: "New title", locations, links: [] });
    expect(prisma.paymentLink.findMany).not.toHaveBeenCalled();
    expect(read().websiteDraft.inventoryChanges).toBeUndefined();
    await stores.publishWebsiteDraft("merchant-1", "store-1", 1);
    expect(prisma.paymentLink.updateMany).not.toHaveBeenCalled();
  });

  it("does not rewrite unchanged stock, and conflicts on a sale after an explicit stock edit", async () => {
    const { prisma, stores, read } = setup();
    prisma.paymentLink.findMany.mockResolvedValue([{ id: "p1", name: "Tea", stock: 5, locationStocks: { centro: 5 } }]);
    const locations = [{ id: "centro", name: "Centro", pickupEnabled: true, deliveryEnabled: false, openingHours: [], inventory: [{ paymentLinkId: "p1", stock: 5 }] }];
    await stores.saveWebsiteDraft("merchant-1", "store-1", { revision: 0, tagline: "Private", locations, inventoryProductIds: ["p1"], links: [] });
    expect(read().websiteDraft.inventoryChanges).toEqual([]);
    await stores.publishWebsiteDraft("merchant-1", "store-1", 1);
    expect(prisma.paymentLink.updateMany).not.toHaveBeenCalled();
    locations[0].inventory[0].stock = 8;
    await stores.saveWebsiteDraft("merchant-1", "store-1", { revision: 2, tagline: "Next", locations, inventoryProductIds: ["p1"], links: [] });
    expect(prisma.paymentLink.updateMany).not.toHaveBeenCalled();
    prisma.paymentLink.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(stores.publishWebsiteDraft("merchant-1", "store-1", 3)).rejects.toThrow("El stock de Tea cambió");
    expect(read().tagline).toBe("Private");
    expect(read().websiteRevision).toBe(3);
  });
});
