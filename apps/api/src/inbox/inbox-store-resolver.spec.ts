import { InboxStoreResolver } from "./inbox-store-resolver";

function verified(name: string) {
  return { settings: { emailWorkspace: { domain: { name, senderName: "Tienda", status: "verified" } } } };
}

function db(rows: unknown[]) {
  return { storeRetention: { findMany: jest.fn().mockResolvedValue(rows) } };
}

describe("InboxStoreResolver.findByInboundAddress", () => {
  it("resolves an inbound.<domain> address to the store that verified it", async () => {
    const prisma = db([{ storeId: "store-1", ...verified("tienda.test") }]);

    await expect(new InboxStoreResolver(prisma as any).findByInboundAddress("hola@inbound.tienda.test"))
      .resolves.toEqual({ id: "store-1" });
  });

  it("asks the database for the verified status in the SAME query as the domain name", async () => {
    const prisma = db([{ storeId: "store-1", ...verified("tienda.test") }]);

    await new InboxStoreResolver(prisma as any).findByInboundAddress("hola@inbound.tienda.test");

    // Two round trips, name first and status second, is what lets an
    // unverified squatter row be the one that comes back and shadow the real
    // owner. One query with both conditions cannot select that row at all.
    expect(prisma.storeRetention.findMany).toHaveBeenCalledTimes(1);
    const where = prisma.storeRetention.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { settings: { path: ["emailWorkspace", "domain", "name"], equals: "tienda.test" } },
      { settings: { path: ["emailWorkspace", "domain", "status"], equals: "verified" } },
    ]);
  });

  it("drops the message when two verified stores claim the same domain, rather than guessing", async () => {
    const prisma = db([
      { storeId: "store-1", ...verified("tienda.test") },
      { storeId: "impostor", ...verified("tienda.test") },
    ]);

    await expect(new InboxStoreResolver(prisma as any).findByInboundAddress("hola@inbound.tienda.test"))
      .resolves.toBeNull();
  });

  it("returns null when no store matches", async () => {
    const prisma = db([]);

    await expect(new InboxStoreResolver(prisma as any).findByInboundAddress("hola@inbound.nadie.test"))
      .resolves.toBeNull();
  });

  it("rejects a row whose stored status is not verified, even if the query returned it", async () => {
    const prisma = db([{ storeId: "store-1", settings: { emailWorkspace: { domain: { name: "tienda.test", senderName: "T", status: "pending" } } } }]);

    await expect(new InboxStoreResolver(prisma as any).findByInboundAddress("hola@inbound.tienda.test"))
      .resolves.toBeNull();
  });

  it("ignores an address that is not on the inbound subdomain", async () => {
    const prisma = db([{ storeId: "store-1", ...verified("tienda.test") }]);

    await expect(new InboxStoreResolver(prisma as any).findByInboundAddress("hola@tienda.test")).resolves.toBeNull();
    expect(prisma.storeRetention.findMany).not.toHaveBeenCalled();
  });
});
