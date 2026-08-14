/**
 * pagosYa-side contract for Bolivia's Factura Electrónica en Línea (SIN/SIAT).
 * Modeled on PaymentRailAdapter: swap MockSinInvoicingAdapter for a real
 * client once pagosYa is registered with SIN as an authorized invoicing
 * system, without touching InvoicingService/InvoiceEmissionWorker.
 *
 * IMPORTANT: this interface reflects the *shape* of SIN's real process
 * (CUIS once per NIT+sucursal+puntoVenta, CUFD refreshed ~daily, CUF per
 * invoice) as described in secondary sources, not SIN's actual WSDL/XSD —
 * siatinfo.impuestos.gob.bo's TLS chain couldn't be verified when this was
 * written, so the primary spec was never fetched. Do not treat
 * MockSinInvoicingAdapter's field formats as accurate; get the real XML
 * schema, XMLDSig signing requirements, and CUF algorithm from SIN's
 * technical documentation before building a real adapter against this.
 */
export interface EnsureCuisRequest {
  nit: string;
  razonSocial: string;
  sucursal: number;
  puntoVenta: number;
}

export interface EnsureCuisResult {
  cuis: string;
}

export interface RequestCufdRequest {
  nit: string;
  cuis: string;
  sucursal: number;
  puntoVenta: number;
}

export interface RequestCufdResult {
  cufd: string;
  expiresAt: Date;
}

export interface EmitInvoiceRequest {
  nit: string;
  cuis: string;
  cufd: string;
  sucursal: number;
  puntoVenta: number;
  amount: number;
  currency: string;
  customerName: string;
  customerDocument: string;
  idempotencyKey: string;
}

export type InvoiceEmissionStatus = "emitted" | "failed";

export interface EmitInvoiceResult {
  status: InvoiceEmissionStatus;
  cuf?: string;
  failureReason?: string;
  raw: Record<string, unknown>;
}

export interface InvoicingProvider {
  /** Whether this provider can submit legally valid invoice XML, not only obtain authorization codes. */
  readonly invoiceEmissionReady: boolean;
  ensureCuis(req: EnsureCuisRequest): Promise<EnsureCuisResult>;
  requestCufd(req: RequestCufdRequest): Promise<RequestCufdResult>;
  emitInvoice(req: EmitInvoiceRequest): Promise<EmitInvoiceResult>;
}
