import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CustomDomainStatus, MerchantStatus, StoreStatus } from "@prisma/client";
import { promises as dns } from "node:dns";
import { CustomDomainsService, normalizeCustomDomainHostname } from "./custom-domains.service";

function makePrisma() {
  const prisma = {
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
    store: { findFirst: jest.fn() },
    customDomain: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  prisma.$transaction.mockImplementation(fn => fn(prisma));
  return prisma;
}

function makeConfig() {
  return {
    get: jest.fn((key: string) => ({
      "app.customDomains.target": "stores.pagosya.bo",
      "app.checkoutOrigin": "https://checkout.pagosya.bo",
    })[key]),
  };
}

const pendingDomain = {
  id: "domain_1",
  storeId: "store_1",
  hostname: "www.mitienda.bo",
  status: CustomDomainStatus.PENDING,
  verificationToken: "verification_token",
  verifiedAt: null,
  lastCheckedAt: null,
  createdAt: new Date("2026-08-22T12:00:00.000Z"),
  updatedAt: new Date("2026-08-22T12:00:00.000Z"),
};

describe("normalizeCustomDomainHostname", () => {
  it("normalizes a full HTTPS URL and internationalized hostname", () => {
    expect(normalizeCustomDomainHostname("https://Mañana.bo/")).toBe("xn--maana-pta.bo");
  });

  it.each(["localhost", "127.0.0.1", "example.com/path", "example.com:444", "*.example.com"])(
    "rejects an unsafe or unroutable hostname: %s",
    (hostname) => expect(() => normalizeCustomDomainHostname(hostname)).toThrow(BadRequestException),
  );
});

describe("CustomDomainsService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each([400, 450])("revalidates all %i domains exactly once in bounded runs, then starts another cycle", async count => {
    const startedAt = new Date("2026-09-19T12:00:00.000Z");
    jest.useFakeTimers({ now: startedAt });
    const prisma = makePrisma();
    const domains = Array.from({ length: count }, (_, index) => ({
      ...pendingDomain,
      id: `domain_${String(index).padStart(3, "0")}`,
      hostname: `tienda-${index}.bo`,
      status: CustomDomainStatus.ACTIVE as CustomDomainStatus,
      domainOrderId: null as string | null,
      lastCheckedAt: index < 150 ? null : new Date("2026-09-18T12:00:00.000Z"),
    }));
    const excluded = [
      { ...domains[0], id: "managed", domainOrderId: "order_1" },
      { ...domains[0], id: "pending", status: CustomDomainStatus.PENDING },
    ];
    const rows = [...domains, ...excluded].reverse();
    prisma.customDomain.findMany.mockImplementation(({ where, orderBy = [], take }) => {
      const eligible = rows.filter(domain => domain.status === where.status && domain.domainOrderId === where.domainOrderId
        && (!where.OR || where.OR.some((condition: { lastCheckedAt: null | { lt: Date } }) => condition.lastCheckedAt === null
          ? domain.lastCheckedAt === null
          : domain.lastCheckedAt !== null && domain.lastCheckedAt < condition.lastCheckedAt.lt)));
      eligible.sort((left, right) => {
        for (const order of orderBy) {
          if (order.lastCheckedAt) {
            const nullValue = order.lastCheckedAt.nulls === "first" ? -Infinity : Infinity;
            const a = left.lastCheckedAt?.getTime() ?? nullValue;
            const b = right.lastCheckedAt?.getTime() ?? nullValue;
            if (a !== b) return (a < b ? -1 : 1) * (order.lastCheckedAt.sort === "asc" ? 1 : -1);
          }
          if (order.id && left.id !== right.id) return left.id.localeCompare(right.id) * (order.id === "asc" ? 1 : -1);
        }
        return 0;
      });
      return Promise.resolve(eligible.slice(0, take).map(domain => ({ ...domain })));
    });
    prisma.customDomain.updateMany.mockImplementation(({ where, data }) => {
      const domain = rows.find(row => row.id === where.id && row.status === where.status);
      if (domain) Object.assign(domain, data);
      return Promise.resolve({ count: domain ? 1 : 0 });
    });
    const txt = jest.spyOn(dns, "resolveTxt").mockResolvedValue([["pagosya-site-verification=verification_token"]]);
    const cname = jest.spyOn(dns, "resolveCname").mockResolvedValue(["stores.pagosya.bo"]);
    const service = new CustomDomainsService(prisma as any, makeConfig() as any);

    for (let offset = 0; offset < count; offset += 200) {
      const checked = Math.min(200, count - offset);
      await expect(service.reconcileActiveDomains()).resolves.toEqual({ checked });
      jest.advanceTimersByTime(15 * 60 * 1000);
    }

    expect(prisma.customDomain.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: CustomDomainStatus.ACTIVE, domainOrderId: null }),
      orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      take: 200,
    }));
    expect(txt.mock.calls.map(([hostname]) => hostname)).toEqual(domains.map(domain => `_pagosya.${domain.hostname}`));
    expect(cname.mock.calls.map(([hostname]) => hostname)).toEqual(domains.map(domain => domain.hostname));
    expect(domains.every(domain => domain.lastCheckedAt !== null && domain.lastCheckedAt >= startedAt)).toBe(true);
    expect(excluded.every(domain => domain.lastCheckedAt === null)).toBe(true);

    await expect(service.reconcileActiveDomains()).resolves.toEqual({ checked: 200 });
    expect(txt.mock.calls.slice(count).map(([hostname]) => hostname)).toEqual(domains.slice(0, 200).map(domain => `_pagosya.${domain.hostname}`));
  });

  it.each(["valid", "missing TXT", "TXT lookup failure", "missing routing"])(
    "records the reconciliation timestamp and status for %s",
    async outcome => {
      const checkedAt = new Date("2026-09-19T12:00:00.000Z");
      jest.useFakeTimers({ now: checkedAt });
      const prisma = makePrisma();
      prisma.customDomain.findMany.mockResolvedValue([{ ...pendingDomain, status: CustomDomainStatus.ACTIVE }]);
      prisma.customDomain.updateMany.mockResolvedValue({ count: 1 });
      const txt = jest.spyOn(dns, "resolveTxt");
      if (outcome === "TXT lookup failure") txt.mockRejectedValue(new Error("ENODATA"));
      else txt.mockResolvedValue(outcome === "missing TXT" ? [] : [["pagosya-site-verification=verification_token"]]);
      jest.spyOn(dns, "resolveCname").mockResolvedValue(outcome === "missing routing" ? [] : ["stores.pagosya.bo"]);
      jest.spyOn(dns, "resolve4").mockResolvedValue([]);
      jest.spyOn(dns, "resolve6").mockResolvedValue([]);
      const service = new CustomDomainsService(prisma as any, makeConfig() as any);

      await expect(service.reconcileActiveDomains()).resolves.toEqual({ checked: 1 });

      expect(prisma.customDomain.updateMany).toHaveBeenCalledWith({
        where: { id: pendingDomain.id, status: CustomDomainStatus.ACTIVE },
        data: {
          status: outcome === "valid" ? CustomDomainStatus.ACTIVE : CustomDomainStatus.VERIFIED,
          lastCheckedAt: checkedAt,
        },
      });
    },
  );

  it("creates a pending mapping with exact DNS instructions", async () => {
    const prisma = makePrisma();
    prisma.store.findFirst.mockResolvedValue({ id: "store_1" });
    prisma.customDomain.count.mockResolvedValue(0);
    prisma.customDomain.create.mockImplementation(({ data }) => Promise.resolve({ ...pendingDomain, ...data }));
    const service = new CustomDomainsService(prisma as any, makeConfig() as any);

    const result = await service.create("merchant_1", "store_1", "www.mitienda.bo");

    expect(result.status).toBe(CustomDomainStatus.PENDING);
    expect(result.dns.verification.name).toBe("_pagosya.www.mitienda.bo");
    expect(result.dns.verification.value).toMatch(/^pagosya-site-verification=/);
    expect(result.dns.routing).toEqual({ type: "CNAME", name: "www.mitienda.bo", value: "stores.pagosya.bo" });
  });

  it("does not let two stores claim the same hostname", async () => {
    const prisma = makePrisma();
    prisma.store.findFirst.mockResolvedValue({ id: "store_1" });
    prisma.customDomain.count.mockResolvedValue(0);
    prisma.customDomain.create.mockRejectedValue({ code: "P2002" });
    const service = new CustomDomainsService(prisma as any, makeConfig() as any);

    await expect(service.create("merchant_1", "store_1", "www.mitienda.bo")).rejects.toBeInstanceOf(ConflictException);
  });

  it("activates a hostname only when its TXT ownership token matches", async () => {
    const prisma = makePrisma();
    prisma.store.findFirst.mockResolvedValue({ id: "store_1" });
    prisma.customDomain.findFirst.mockResolvedValue(pendingDomain);
    prisma.customDomain.update.mockImplementation(({ data }) => Promise.resolve({ ...pendingDomain, ...data }));
    jest.spyOn(dns, "resolveTxt").mockResolvedValue([["pagosya-site-verification=verification_", "token"]]);
    jest.spyOn(dns, "resolveCname").mockResolvedValue(["stores.pagosya.bo"]);
    const service = new CustomDomainsService(prisma as any, makeConfig() as any);

    const result = await service.verify("merchant_1", "store_1", "domain_1");

    expect(result.status).toBe(CustomDomainStatus.ACTIVE);
    expect(prisma.customDomain.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "domain_1" },
      data: expect.objectContaining({ status: CustomDomainStatus.ACTIVE }),
    }));
  });

  it("keeps ownership verified but not active until routing reaches the storefront", async () => {
    const prisma = makePrisma();
    prisma.store.findFirst.mockResolvedValue({ id: "store_1" });
    prisma.customDomain.findFirst.mockResolvedValue(pendingDomain);
    prisma.customDomain.update.mockImplementation(({ data }) => Promise.resolve({ ...pendingDomain, ...data }));
    jest.spyOn(dns, "resolveTxt").mockResolvedValue([["pagosya-site-verification=verification_token"]]);
    jest.spyOn(dns, "resolveCname").mockRejectedValue(new Error("no cname"));
    jest.spyOn(dns, "resolve4").mockResolvedValue([]);
    jest.spyOn(dns, "resolve6").mockResolvedValue([]);
    const service = new CustomDomainsService(prisma as any, makeConfig() as any);

    const result = await service.verify("merchant_1", "store_1", "domain_1");

    expect(result.status).toBe(CustomDomainStatus.VERIFIED);
  });

  it("keeps the hostname pending when DNS does not match", async () => {
    const prisma = makePrisma();
    prisma.store.findFirst.mockResolvedValue({ id: "store_1" });
    prisma.customDomain.findFirst.mockResolvedValue(pendingDomain);
    prisma.customDomain.update.mockResolvedValue(pendingDomain);
    jest.spyOn(dns, "resolveTxt").mockResolvedValue([["different-token"]]);
    const service = new CustomDomainsService(prisma as any, makeConfig() as any);

    await expect(service.verify("merchant_1", "store_1", "domain_1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("resolves only an active domain attached to an active store and merchant", async () => {
    const prisma = makePrisma();
    prisma.customDomain.findUnique.mockResolvedValue({
      ...pendingDomain,
      status: CustomDomainStatus.ACTIVE,
      store: { slug: "tienda-1", status: StoreStatus.ACTIVE, merchant: { status: MerchantStatus.ACTIVE } },
    });
    const service = new CustomDomainsService(prisma as any, makeConfig() as any);

    await expect(service.resolve("www.mitienda.bo")).resolves.toEqual({ hostname: "www.mitienda.bo", slug: "tienda-1" });

    prisma.customDomain.findUnique.mockResolvedValue({
      ...pendingDomain,
      store: { slug: "tienda-1", status: StoreStatus.ACTIVE, merchant: { status: MerchantStatus.ACTIVE } },
    });
    await expect(service.resolve("www.mitienda.bo")).rejects.toBeInstanceOf(NotFoundException);
  });
});
