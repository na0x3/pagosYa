/** pagosYa's gateway fee, in basis points (250 = 2.5%), matching the incumbent's published rate. */
export const PAGOSYA_FEE_BPS = 250;

export function computeFee(amount: number): number {
  return Math.floor((amount * PAGOSYA_FEE_BPS) / 10000);
}
