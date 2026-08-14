import { BadRequestException } from "@nestjs/common";
import { SiatCatalogService } from "./siat-catalog.service";

const profile = { id: "profile_1", merchantId: "merchant_1", nit: "709354049", cuis: "CUIS-1", sucursal: 0, puntoVenta: 0 };

function makeFixture() {
  const cache = new Map<string, any>();
  const prisma = {
    merchantInvoicingProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
    siatCatalogCache: {
      findUnique: jest.fn().mockImplementation(({ where }) =>
        cache.get(where.invoicingProfileId_catalog.catalog) ?? null,
      ),
      upsert: jest.fn().mockImplementation(({ create, update }) => {
        const prior = cache.get(create.catalog);
        const saved = { ...(prior ?? create), ...(prior ? update : {}), syncedAt: new Date() };
        cache.set(create.catalog, saved);
        return saved;
      }),
    },
  };
  const soap = {
    cfg: { environmentCode: 2, systemCode: "SYSTEM-1" },
    call: jest.fn(),
  };
  const config = { get: jest.fn().mockReturnValue(true) };
  return { service: new SiatCatalogService(prisma as any, soap as any, config as any), prisma, soap, cache };
}

describe("SiatCatalogService", () => {
  it("synchronizes taxpayer activities and caches them under the invoicing profile", async () => {
    const { service, soap, prisma } = makeFixture();
    soap.call.mockResolvedValue(`
      <RespuestaListaActividades>
        <listaActividades><codigoCaeb>477210</codigoCaeb><descripcion>VENTA DE CALZADO</descripcion><tipoActividad>P</tipoActividad></listaActividades>
        <transaccion>true</transaccion>
      </RespuestaListaActividades>
    `);

    const result = await service.list("merchant_1", "activities");

    expect(result.entries).toEqual([{ codigoCaeb: "477210", descripcion: "VENTA DE CALZADO", tipoActividad: "P" }]);
    expect(soap.call).toHaveBeenCalledWith("FacturacionSincronizacion", "sincronizarActividades", "SolicitudSincronizacion", {
      codigoAmbiente: 2,
      codigoPuntoVenta: 0,
      codigoSistema: "SYSTEM-1",
      codigoSucursal: 0,
      cuis: "CUIS-1",
      nit: "709354049",
    });
    expect(prisma.siatCatalogCache.upsert).toHaveBeenCalled();
  });

  it("uses a fresh daily cache without making another SOAP call", async () => {
    const { service, soap, cache } = makeFixture();
    cache.set("units", {
      invoicingProfileId: "profile_1",
      catalog: "units",
      entries: [{ codigoClasificador: 58, descripcion: "UNIDAD" }],
      syncedAt: new Date(),
    });

    const result = await service.list("merchant_1", "units");

    expect(result.source).toBe("cache");
    expect(result.entries[0]).toEqual({ codigoClasificador: 58, descripcion: "UNIDAD" });
    expect(soap.call).not.toHaveBeenCalled();
  });

  it("validates SIN product/activity/unit mapping and Compra-Venta sector compatibility", async () => {
    const { service, cache } = makeFixture();
    for (const [catalog, entries] of Object.entries({
      activities: [{ codigoCaeb: "477210", descripcion: "VENTA DE CALZADO" }],
      products: [{ codigoActividad: "477210", codigoProducto: 123456, descripcionProducto: "CALZADO" }],
      units: [{ codigoClasificador: 58, descripcion: "UNIDAD" }],
      "activity-document-sectors": [{ codigoActividad: "477210", codigoDocumentoSector: 1, tipoDocumentoSector: "FACTURA COMPRA-VENTA" }],
    })) {
      cache.set(catalog, { invoicingProfileId: "profile_1", catalog, entries, syncedAt: new Date() });
    }

    await expect(service.assertProductClassification("merchant_1", {
      actividadEconomica: "477210",
      codigoProductoSin: "123456",
      unidadMedida: 58,
    })).resolves.toBeUndefined();

    await expect(service.assertProductClassification("merchant_1", {
      actividadEconomica: "477210",
      codigoProductoSin: "999999",
      unidadMedida: 58,
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
