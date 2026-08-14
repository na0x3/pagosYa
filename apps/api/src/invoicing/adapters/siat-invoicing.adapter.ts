import { Injectable } from "@nestjs/common";
import {
  EmitInvoiceRequest,
  EmitInvoiceResult,
  EnsureCuisRequest,
  EnsureCuisResult,
  InvoicingProvider,
  RequestCufdRequest,
  RequestCufdResult,
} from "../interfaces/invoicing-provider.interface";
import { readSiatMessages, readSiatTag, SiatSoapClient, SiatSoapError } from "./siat-soap.client";

@Injectable()
export class SiatInvoicingAdapter implements InvoicingProvider {
  // The current Invoice model does not yet contain SIN activity/product/unit
  // codes or a stable fiscal sequence, so it cannot produce valid XML/CUF.
  readonly invoiceEmissionReady = false;

  constructor(private readonly soap: SiatSoapClient) {}

  async verifyCommunication(): Promise<boolean> {
    const xml = await this.soap.call("FacturacionCodigos", "verificarComunicacion");
    return readSiatTag(xml, "transaccion") === "true";
  }

  async ensureCuis(req: EnsureCuisRequest): Promise<EnsureCuisResult> {
    const cfg = this.soap.cfg;
    const xml = await this.soap.call("FacturacionCodigos", "cuis", "SolicitudCuis", {
      codigoAmbiente: cfg.environmentCode,
      codigoModalidad: cfg.modalityCode,
      codigoPuntoVenta: req.puntoVenta,
      codigoSistema: cfg.systemCode,
      codigoSucursal: req.sucursal,
      nit: req.nit,
    });
    const cuis = readSiatTag(xml, "codigo");
    const success = readSiatTag(xml, "transaccion") === "true";
    if (!success || !cuis) throw this.responseError("CUIS request rejected", xml);
    return { cuis };
  }

  async requestCufd(req: RequestCufdRequest): Promise<RequestCufdResult> {
    const cfg = this.soap.cfg;
    const xml = await this.soap.call("FacturacionCodigos", "cufd", "SolicitudCufd", {
      codigoAmbiente: cfg.environmentCode,
      codigoModalidad: cfg.modalityCode,
      codigoPuntoVenta: req.puntoVenta,
      codigoSistema: cfg.systemCode,
      codigoSucursal: req.sucursal,
      cuis: req.cuis,
      nit: req.nit,
    });
    const cufd = readSiatTag(xml, "codigo");
    const expiresAt = readSiatTag(xml, "fechaVigencia");
    const success = readSiatTag(xml, "transaccion") === "true";
    if (!success || !cufd || !expiresAt) throw this.responseError("CUFD request rejected", xml);
    return { cufd, expiresAt: new Date(expiresAt) };
  }

  async emitInvoice(_req: EmitInvoiceRequest): Promise<EmitInvoiceResult> {
    return {
      status: "failed",
      failureReason: "siat_invoice_emission_not_ready",
      raw: { provider: "siat", submitted: false },
    };
  }

  private responseError(message: string, xml: string): SiatSoapError {
    const messages = readSiatMessages(xml);
    const detail = messages.map((item) => [item.codigo, item.descripcion].filter(Boolean).join(": ")).join("; ");
    return new SiatSoapError(detail ? `${message}: ${detail}` : message, messages);
  }
}
