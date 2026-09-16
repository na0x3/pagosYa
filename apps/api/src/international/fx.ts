import type { DlocalConfig } from "../config/configuration";
import { DOMESTIC_PRICING, FeePricing } from "../ledger/ledger.constants";

export interface FxSnapshot {
  originalAmount: number;
  originalCurrency: "BOB";
  rate: number;
  convertedAt: string;
}

export class FxRateUnavailableError extends Error {
  constructor() {
    super("intl_fx_rate_unavailable");
    this.name = "FxRateUnavailableError";
  }
}

function fxOf(metadata: unknown): FxSnapshot | null {
  const fx = (metadata as { fx?: FxSnapshot } | null)?.fx;
  return fx && typeof fx.originalAmount === "number" && fx.originalCurrency === "BOB" ? fx : null;
}

/**
 * The amount/currency a confirm attempt should charge. Always starts from the
 * merchant's original price, so retries never compound a conversion.
 */
export function resolveChargeAmount(
  current: { amount: number; currency: string; metadata: unknown },
  international: boolean,
  bobPerUsd: number,
  now: Date,
): { amount: number; currency: string; fx: FxSnapshot | null } {
  const previous = fxOf(current.metadata);
  const base = previous ? { amount: previous.originalAmount, currency: "BOB" } : { amount: current.amount, currency: current.currency };
  if (!international || base.currency !== "BOB") return { ...base, fx: null };
  if (!(bobPerUsd > 0)) throw new FxRateUnavailableError();
  return {
    amount: Math.ceil(base.amount / bobPerUsd),
    currency: "USD",
    fx: { originalAmount: base.amount, originalCurrency: "BOB", rate: bobPerUsd, convertedAt: now.toISOString() },
  };
}

export function pricingForRail(railId: string, cfg: Pick<DlocalConfig, "intlFeeBps" | "costBps">): FeePricing {
  return railId === "dlocal" ? { feeBps: cfg.intlFeeBps, railCostBps: cfg.costBps } : DOMESTIC_PRICING;
}

/** The Factura is a Bolivian tax document: emit it in the price the merchant set. */
export function invoiceAmountFor(intent: { amount: number; currency: string; metadata: unknown }): { amount: number; currency: string } {
  const fx = fxOf(intent.metadata);
  return fx ? { amount: fx.originalAmount, currency: "BOB" } : { amount: intent.amount, currency: intent.currency };
}
