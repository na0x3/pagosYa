import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { readSiatBlocks, readSiatMessages, readSiatTag, SiatSoapClient, SiatSoapError } from "./adapters/siat-soap.client";
import { isSiatCatalogName, SIAT_CATALOGS, SiatCatalogEntry, SiatCatalogName } from "./siat-catalog.types";

const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

@Injectable()
export class SiatCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly soap: SiatSoapClient,
    private readonly config: ConfigService,
  ) {}

  async list(
    merchantId: string,
    catalogValue: string,
    options: { refresh?: boolean; activityCode?: string; query?: string; limit?: number } = {},
  ) {
    if (!isSiatCatalogName(catalogValue)) throw new BadRequestException("Unknown SIAT catalog");
    const profile = await this.prisma.merchantInvoicingProfile.findUnique({ where: { merchantId } });
    if (!profile?.cuis) throw new NotFoundException("Configure the merchant invoicing profile and CUIS first");

    const cached = await this.prisma.siatCatalogCache.findUnique({
      where: { invoicingProfileId_catalog: { invoicingProfileId: profile.id, catalog: catalogValue } },
    });
    const fresh = cached && cached.syncedAt.getTime() > Date.now() - CATALOG_TTL_MS;
    let entries = this.readEntries(cached?.entries);
    let source: "cache" | "siat" = "cache";
    let syncedAt = cached?.syncedAt ?? null;

    if (options.refresh || !fresh) {
      if (!this.config.get<boolean>("app.siat.enabled")) {
        if (!cached) throw new ServiceUnavailableException("SIAT synchronization is not enabled");
      } else {
        entries = await this.fetchCatalog(catalogValue, { ...profile, cuis: profile.cuis });
        const saved = await this.prisma.siatCatalogCache.upsert({
          where: { invoicingProfileId_catalog: { invoicingProfileId: profile.id, catalog: catalogValue } },
          create: { invoicingProfileId: profile.id, catalog: catalogValue, entries: entries as Prisma.InputJsonValue },
          update: { entries: entries as Prisma.InputJsonValue, syncedAt: new Date() },
        });
        source = "siat";
        syncedAt = saved.syncedAt;
      }
    }

    const filtered = this.filterEntries(entries, options);
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    return {
      catalog: catalogValue,
      source,
      syncedAt,
      total: filtered.length,
      entries: filtered.slice(0, limit),
    };
  }

  async assertProductClassification(
    merchantId: string,
    classification: { actividadEconomica: string; codigoProductoSin: string; unidadMedida: number },
  ): Promise<void> {
    const [activities, products, units, relationships] = await Promise.all([
      this.allEntries(merchantId, "activities"),
      this.allEntries(merchantId, "products"),
      this.allEntries(merchantId, "units"),
      this.allEntries(merchantId, "activity-document-sectors"),
    ]);
    if (!activities.some((entry) => entry.codigoCaeb === classification.actividadEconomica)) {
      throw new BadRequestException("actividadEconomica is not registered for this merchant NIT");
    }
    if (!products.some((entry) =>
      String(entry.codigoActividad) === classification.actividadEconomica &&
      String(entry.codigoProducto) === classification.codigoProductoSin,
    )) {
      throw new BadRequestException("codigoProductoSin is not related to the selected merchant activity");
    }
    if (!units.some((entry) => Number(entry.codigoClasificador) === classification.unidadMedida)) {
      throw new BadRequestException("unidadMedida is not present in the synchronized SIAT catalog");
    }
    if (!relationships.some((entry) =>
      String(entry.codigoActividad) === classification.actividadEconomica && Number(entry.codigoDocumentoSector) === 1,
    )) {
      throw new BadRequestException("The selected activity is not enabled for Factura Compra-Venta (sector 1)");
    }
  }

  private async allEntries(merchantId: string, catalog: SiatCatalogName): Promise<SiatCatalogEntry[]> {
    const result = await this.list(merchantId, catalog, { limit: MAX_LIMIT });
    // Products can exceed the public response cap. Read the just-refreshed
    // complete cache for validation rather than accepting a partial list.
    if (result.total <= result.entries.length) return result.entries;
    const profile = await this.prisma.merchantInvoicingProfile.findUnique({ where: { merchantId } });
    const cache = await this.prisma.siatCatalogCache.findUnique({
      where: { invoicingProfileId_catalog: { invoicingProfileId: profile!.id, catalog } },
    });
    return this.readEntries(cache?.entries);
  }

  private async fetchCatalog(
    catalog: SiatCatalogName,
    profile: { nit: string; cuis: string; sucursal: number; puntoVenta: number },
  ): Promise<SiatCatalogEntry[]> {
    const cfg = this.soap.cfg;
    const definition = SIAT_CATALOGS[catalog];
    const xml = await this.soap.call("FacturacionSincronizacion", definition.method, "SolicitudSincronizacion", {
      codigoAmbiente: cfg.environmentCode,
      codigoPuntoVenta: profile.puntoVenta,
      codigoSistema: cfg.systemCode,
      codigoSucursal: profile.sucursal,
      cuis: profile.cuis,
      nit: profile.nit,
    });
    if (readSiatTag(xml, "transaccion") !== "true") {
      const messages = readSiatMessages(xml);
      const detail = messages.map((item) => [item.codigo, item.descripcion].filter(Boolean).join(": ")).join("; ");
      throw new SiatSoapError(detail ? `SIAT catalog synchronization rejected: ${detail}` : "SIAT catalog synchronization rejected", messages);
    }
    return readSiatBlocks(xml, definition.itemTag).map((block) => {
      const entry: SiatCatalogEntry = {};
      for (const field of definition.fields) {
        const value = readSiatTag(block, field);
        if (value === undefined) continue;
        entry[field] = field.startsWith("codigo") && field !== "codigoCaeb" && field !== "codigoActividad"
          ? Number(value)
          : value;
      }
      return entry;
    });
  }

  private readEntries(value: Prisma.JsonValue | undefined): SiatCatalogEntry[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is SiatCatalogEntry => !!entry && typeof entry === "object" && !Array.isArray(entry)) as SiatCatalogEntry[];
  }

  private filterEntries(
    entries: SiatCatalogEntry[],
    options: { activityCode?: string; query?: string },
  ): SiatCatalogEntry[] {
    const query = options.query?.trim().toLocaleLowerCase("es");
    return entries.filter((entry) => {
      if (options.activityCode && String(entry.codigoActividad ?? entry.codigoCaeb ?? "") !== options.activityCode) return false;
      if (!query) return true;
      return Object.values(entry).some((value) => String(value).toLocaleLowerCase("es").includes(query));
    });
  }
}
