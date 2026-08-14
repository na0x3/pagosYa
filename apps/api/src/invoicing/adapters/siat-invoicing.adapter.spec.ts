import { SiatInvoicingAdapter } from "./siat-invoicing.adapter";

function makeSoap() {
  return {
    cfg: {
      environmentCode: 2,
      modalityCode: 2,
      systemCode: "SYSTEM-1",
    },
    call: jest.fn(),
  };
}

describe("SiatInvoicingAdapter", () => {
  it("requests a CUIS using the registered computarizada/test constants", async () => {
    const soap = makeSoap();
    soap.call.mockResolvedValue(`
      <cuisResponse><RespuestaCuis><codigo>CUIS-REAL</codigo>
      <fechaVigencia>2027-08-13T12:00:00.000</fechaVigencia><transaccion>true</transaccion>
      </RespuestaCuis></cuisResponse>
    `);
    const adapter = new SiatInvoicingAdapter(soap as any);

    await expect(
      adapter.ensureCuis({ nit: "709354049", razonSocial: "Test", sucursal: 0, puntoVenta: 0 }),
    ).resolves.toEqual({ cuis: "CUIS-REAL" });
    expect(soap.call).toHaveBeenCalledWith("FacturacionCodigos", "cuis", "SolicitudCuis", {
      codigoAmbiente: 2,
      codigoModalidad: 2,
      codigoPuntoVenta: 0,
      codigoSistema: "SYSTEM-1",
      codigoSucursal: 0,
      nit: "709354049",
    });
  });

  it("maps a successful CUFD response and its exact expiry", async () => {
    const soap = makeSoap();
    soap.call.mockResolvedValue(`
      <cufdResponse><RespuestaCufd><codigo>CUFD-REAL</codigo><codigoControl>CONTROL</codigoControl>
      <fechaVigencia>2026-08-14T15:30:00.000</fechaVigencia><transaccion>true</transaccion>
      </RespuestaCufd></cufdResponse>
    `);
    const adapter = new SiatInvoicingAdapter(soap as any);

    const result = await adapter.requestCufd({ nit: "709354049", cuis: "CUIS-REAL", sucursal: 0, puntoVenta: 0 });

    expect(result).toEqual({ cufd: "CUFD-REAL", expiresAt: new Date("2026-08-14T15:30:00.000") });
  });

  it("surfaces SIAT response codes without leaking credentials", async () => {
    const soap = makeSoap();
    soap.call.mockResolvedValue(`
      <cuisResponse><RespuestaCuis><mensajesList><codigo>980</codigo>
      <descripcion>Datos de solicitud incorrectos</descripcion></mensajesList><transaccion>false</transaccion>
      </RespuestaCuis></cuisResponse>
    `);
    const adapter = new SiatInvoicingAdapter(soap as any);

    await expect(
      adapter.ensureCuis({ nit: "1", razonSocial: "Test", sucursal: 0, puntoVenta: 0 }),
    ).rejects.toThrow("980: Datos de solicitud incorrectos");
  });
});
