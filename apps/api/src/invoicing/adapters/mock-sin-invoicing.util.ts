import { customAlphabet } from "nanoid";

const codePart = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 20);

export function simulateLatency(minMs = 150, maxMs = 500): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export function generateMockCode(prefix: string): string {
  return `${prefix}-MOCK-${codePart()}`;
}
