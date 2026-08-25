import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CustomDomainStatus, MerchantStatus, StoreStatus } from "@prisma/client";
import { promises as dns } from "node:dns";
import { CustomDomainsService, normalizeCustomDomainHostname } from "./custom-domains.service";

function makePrisma() {
  return {
    store: { findFirst: jest.fn() },
    customDomain: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
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
  afterEach(() => jest.restoreAllMocks());

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
