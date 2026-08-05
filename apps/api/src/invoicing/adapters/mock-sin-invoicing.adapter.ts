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
import { generateMockCode, simulateLatency } from "./mock-sin-invoicing.util";

const CUFD_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Stands in for SIN's real "Facturación Electrónica en Línea" web service —
 * see the warning on InvoicingProvider. Deterministic-enough for tests, not
 * a real CUF/CUFD implementation.
 *
 * Test hook: customerDocument "0000000_sin_down" simulates SIN's service
 * being unreachable (a real, documented failure mode for contingency
 * handling), mirroring the mock rail adapters' tok_visa_decline convention.
 */
@Injectable()
export class MockSinInvoicingAdapter implements InvoicingProvider {
  async ensureCuis(req: EnsureCuisRequest): Promise<EnsureCuisResult> {
    await simulateLatency();
    return { cuis: generateMockCode(`CUIS-${req.nit}-${req.sucursal}-${req.puntoVenta}`) };
  }

  async requestCufd(req: RequestCufdRequest): Promise<RequestCufdResult> {
    await simulateLatency();
    return { cufd: generateMockCode(`CUFD-${req.cuis}`), expiresAt: new Date(Date.now() + CUFD_TTL_MS) };
  }

  async emitInvoice(req: EmitInvoiceRequest): Promise<EmitInvoiceResult> {
    await simulateLatency();

    if (req.customerDocument === "0000000_sin_down") {
      return { status: "failed", failureReason: "sin_service_unavailable", raw: { mock: true } };
    }

    return {
      status: "emitted",
      cuf: generateMockCode(`CUF-${req.nit}-${req.cufd}`),
      raw: { mock: true, emittedAt: new Date().toISOString() },
    };
  }
}
