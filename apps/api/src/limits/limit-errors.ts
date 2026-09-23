import { ForbiddenException } from "@nestjs/common";

export const BUYER_REFUSAL = "Este comercio no puede recibir pagos en este momento.";

export function limitExceeded() {
  return new ForbiddenException({ code: "limit_exceeded", message: BUYER_REFUSAL });
}

export function perPaymentLimitExceeded(audience: "merchant" | "buyer") {
  return new ForbiddenException({
    code: "per_payment_limit_exceeded",
    message: audience === "merchant" ? "Este cobro supera el máximo por pago de tu nivel." : BUYER_REFUSAL,
  });
}
