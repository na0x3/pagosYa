import { customAlphabet } from "nanoid";
import { RailResult, RailResultStatus } from "../interfaces/payment-rail-adapter.interface";

const referenceId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);

export function simulateLatency(minMs = 200, maxMs = 800): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export function generateRailReference(prefix: string): string {
  return `${prefix}_${referenceId()}`;
}

export function outcomeResult(
  railId: string,
  railReference: string,
  status: RailResultStatus,
  extra: Partial<RailResult> = {},
): RailResult {
  return {
    status,
    railReference,
    raw: { railId, simulatedAt: new Date().toISOString() },
    ...extra,
  };
}
