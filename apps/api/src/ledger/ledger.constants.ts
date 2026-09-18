/** pagosYa's gateway fee, in basis points (250 = 2.5%), matching the incumbent's published rate. */
export const PAGOSYA_FEE_BPS = 250;

/** What a capture charges the merchant, and what the rail is estimated to charge pagosYa, in bps. */
export interface FeePricing {
  feeBps: number;
  railCostBps: number;
}

export const DOMESTIC_PRICING: FeePricing = { feeBps: PAGOSYA_FEE_BPS, railCostBps: 0 };

export function computeFee(amount: number, feeBps = PAGOSYA_FEE_BPS): number {
  return Math.floor((amount * feeBps) / 10000);
}
