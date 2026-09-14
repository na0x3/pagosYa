import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { CustomDomainStatus, MerchantStatus, StoreStatus } from "@prisma/client";
import { promises as dns } from "node:dns";
import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { PrismaService } from "../prisma/prisma.service";

const MAX_DOMAINS_PER_STORE = 3;

export function normalizeCustomDomainHostname(input: string): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) throw new BadRequestException("Escribe el dominio que quieres conectar.");

  let parsed: URL;
  try {
    parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    throw new BadRequestException("El dominio no tiene un formato válido.");
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    (parsed.pathname && parsed.pathname !== "/") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new BadRequestException("Escribe solo el dominio, sin rutas, puertos ni parámetros.");
  }

  const hostname = domainToASCII(parsed.hostname.toLowerCase()).replace(/\.$/, "");
  const labels = hostname.split(".");
  if (
    !hostname ||
    hostname.length > 253 ||
    labels.length < 2 ||
    isIP(hostname) !== 0 ||
    labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
  ) {
    throw new BadRequestException("Usa un dominio público válido, por ejemplo www.mitienda.bo.");
  }
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new BadRequestException("Los dominios locales no se pueden publicar.");
  }
  return hostname;
}

@Injectable()
export class CustomDomainsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private targetHostname(): string {
    return (this.config.get<string>("app.customDomains.target") ?? "stores.pagosya.bo").trim().toLowerCase().replace(/\.$/, "");
  }

  private reservedHostnames(): Set<string> {
    const reserved = new Set([this.targetHostname()]);
    try {
      reserved.add(new URL(this.config.get<string>("app.checkoutOrigin") ?? "http://localhost:5174").hostname.toLowerCase());
    } catch {
      // A malformed deployment value is already visible at startup; it should
      // not make domain management itself unavailable.
    }
    return reserved;
  }

  private async routesToTarget(hostname: string): Promise<boolean> {
    const target = this.targetHostname();
    try {
      const aliases = await dns.resolveCname(hostname);
      if (aliases.some((alias) => alias.toLowerCase().replace(/\.$/, "") === target)) return true;
    } catch {
      // Root-domain ALIAS/ANAME records are commonly flattened into A/AAAA
      // answers, so a missing visible CNAME is not a failure by itself.
    }

    const safeResolve = async (host: string, family: 4 | 6): Promise<string[]> => {
      try {
        return family === 4 ? await dns.resolve4(host) : await dns.resolve6(host);
      } catch {
        return [];
      }
    };
    const [hostV4, targetV4, hostV6, targetV6] = await Promise.all([
      safeResolve(hostname, 4),
      safeResolve(target, 4),
      safeResolve(hostname, 6),
      safeResolve(target, 6),
    ]);
    const targetAddresses = new Set([...targetV4, ...targetV6]);
    return [...hostV4, ...hostV6].some((address) => targetAddresses.has(address));
  }

  private async hasVerificationRecord(domain: { hostname: string; verificationToken: string }): Promise<boolean> {
    try {
      const records = await dns.resolveTxt(`_pagosya.${domain.hostname}`);
      const expected = `pagosya-site-verification=${domain.verificationToken}`;
      return records.some((chunks) => chunks.join("").trim() === expected);
    } catch {
      return false;
    }
  }

  private response(domain: {
    id: string;
    hostname: string;
    status: CustomDomainStatus;
    verificationToken: string;
    domainOrderId?: string | null;
    verifiedAt: Date | null;
    lastCheckedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const target = this.targetHostname();
    return {
      id: domain.id,
      managed: Boolean(domain.domainOrderId),
      hostname: domain.hostname,
      status: domain.status,
      verifiedAt: domain.verifiedAt,
      lastCheckedAt: domain.lastCheckedAt,
      createdAt: domain.createdAt,
      updatedAt: domain.updatedAt,
      url: `https://${domain.hostname}`,
      dns: {
        verification: {
          type: "TXT",
          name: `_pagosya.${domain.hostname}`,
          value: `pagosya-site-verification=${domain.verificationToken}`,
        },
        routing: {
          type: "CNAME",
          name: domain.hostname,
          value: target,
        },
      },
    };
  }

  private async ownedStore(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true } });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }

  async list(merchantId: string, storeId: string) {
    await this.ownedStore(merchantId, storeId);
    const domains = await this.prisma.customDomain.findMany({ where: { storeId }, orderBy: { createdAt: "asc" } });
    return domains.map((domain) => this.response(domain));
  }

  async create(merchantId: string, storeId: string, input: string) {
    await this.ownedStore(merchantId, storeId);
    const hostname = normalizeCustomDomainHostname(input);
    if (this.reservedHostnames().has(hostname)) {
      throw new BadRequestException("Ese dominio pertenece a la infraestructura de pagosYa.");
    }

    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`store-domains:${storeId}`}))`;
      const count = await tx.customDomain.count({ where: { storeId } });
      if (count >= MAX_DOMAINS_PER_STORE) {
        throw new BadRequestException(`Cada tienda puede conectar hasta ${MAX_DOMAINS_PER_STORE} dominios.`);
      }

      try {
        const domain = await tx.customDomain.create({
          data: {
            storeId,
            hostname,
            verificationToken: randomBytes(24).toString("base64url"),
          },
        });
        return this.response(domain);
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          throw new ConflictException("Ese dominio ya está conectado a una tienda.");
        }
        throw error;
      }
    });
  }

  async verify(merchantId: string, storeId: string, domainId: string) {
    await this.ownedStore(merchantId, storeId);
    const domain = await this.prisma.customDomain.findFirst({ where: { id: domainId, storeId } });
    if (!domain) throw new NotFoundException("Domain not found");

    if (domain.domainOrderId) throw new BadRequestException("La conexión de este dominio se verifica automáticamente.");
    const checkedAt = new Date();
    if (!(await this.hasVerificationRecord(domain))) {
      await this.prisma.customDomain.update({ where: { id: domain.id }, data: { lastCheckedAt: checkedAt } });
      throw new BadRequestException("Todavía no encontramos el registro TXT. Revisa los valores y espera a que el DNS se propague.");
    }

    const routingActive = await this.routesToTarget(domain.hostname);
    const updated = await this.prisma.customDomain.update({
      where: { id: domain.id },
      data: {
        status: routingActive ? CustomDomainStatus.ACTIVE : CustomDomainStatus.VERIFIED,
        verifiedAt: domain.verifiedAt ?? checkedAt,
        lastCheckedAt: checkedAt,
      },
    });
    return this.response(updated);
  }

  /** Re-check both ownership and routing so a removed DNS record cannot leave a stale active hostname. */
  @Interval("custom-domain-reconciliation", 15 * 60 * 1000)
  async reconcileActiveDomains() {
    const domains = await this.prisma.customDomain.findMany({
      where: { status: CustomDomainStatus.ACTIVE, domainOrderId: null },
      select: { id: true, hostname: true, verificationToken: true },
      take: 200,
    });
    for (const domain of domains) {
      const [owned, routed] = await Promise.all([this.hasVerificationRecord(domain), this.routesToTarget(domain.hostname)]);
      await this.prisma.customDomain.updateMany({
        where: { id: domain.id, status: CustomDomainStatus.ACTIVE },
        data: { status: owned && routed ? CustomDomainStatus.ACTIVE : CustomDomainStatus.VERIFIED, lastCheckedAt: new Date() },
      });
    }
    return { checked: domains.length };
  }

  async remove(merchantId: string, storeId: string, domainId: string) {
    await this.ownedStore(merchantId, storeId);
    const managed = await this.prisma.customDomain.findFirst({ where: { id: domainId, storeId, domainOrderId: { not: null } } });
    if (managed) throw new BadRequestException("Este dominio fue comprado en pagosYa. Contacta a soporte para transferirlo o cambiar su conexión.");
    const result = await this.prisma.customDomain.deleteMany({ where: { id: domainId, storeId } });
    if (!result.count) throw new NotFoundException("Domain not found");
    return { success: true };
  }

  async resolve(hostnameInput: string) {
    const hostname = normalizeCustomDomainHostname(hostnameInput);
    const domain = await this.prisma.customDomain.findUnique({
      where: { hostname },
      include: {
        domainOrder: { select: { status: true, expiresAt: true, sandbox: true } },
        store: {
          select: {
            slug: true,
            status: true,
            merchant: { select: { status: true } },
          },
        },
      },
    });
    if (
      !domain ||
      domain.status !== CustomDomainStatus.ACTIVE ||
      (domain.domainOrder && (domain.domainOrder.sandbox || domain.domainOrder.status !== 'ACTIVE' || !domain.domainOrder.expiresAt || domain.domainOrder.expiresAt <= new Date())) ||
      domain.store.status !== StoreStatus.ACTIVE ||
      domain.store.merchant.status !== MerchantStatus.ACTIVE
    ) {
      throw new NotFoundException("Este dominio todavía no tiene una tienda publicada.");
    }
    return { hostname, slug: domain.store.slug };
  }
}
