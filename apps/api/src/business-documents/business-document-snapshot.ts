import { BadRequestException } from "@nestjs/common";
import { sha256Hex } from "../legal/legal-documents.service";

export type BusinessDocumentKindName = "INVOICE" | "PROPOSAL" | "CONTRACT";

/** The postgres `integer` columns hold up to 2,147,483,647; stay clearly below. */
export const MAX_DOCUMENT_AMOUNT = 2_000_000_000;

export const DOCUMENT_BLOCK_TYPES = ["heading", "paragraph", "list", "clause"] as const;
export type DocumentBlockType = (typeof DOCUMENT_BLOCK_TYPES)[number];

/** Written by the editor (D1–D3) and by AI drafting (D2/D3). */
export type DocumentBlock = {
  type: DocumentBlockType;
  title?: string;
  text?: string;
  items?: string[];
};

export type DocumentItemInput = { description: string; quantity: number; unitAmount: number; paymentLinkId?: string | null };

/** What a customer sees: frozen at send, hashed, never updated. No internal ids. */
export type DocumentSnapshot = {
  kind: BusinessDocumentKindName;
  numberLabel: string;
  title: string;
  currency: string;
  customer: { name: string | null; email: string | null; phone: string | null; document: string | null };
  items: Array<{ description: string; quantity: number; unitAmount: number; amount: number }>;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  dueAt: string | null;
  validUntil: string | null;
  blocks: DocumentBlock[];
};

export type SnapshotSource = {
  kind: BusinessDocumentKindName;
  number: number | null;
  title: string;
  currency: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerDocument: string | null;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  dueAt: Date | null;
  validUntil: Date | null;
  content: unknown;
  items: Array<{ position: number; description: string; quantity: number; unitAmount: number; amount: number }>;
};

const PREFIX: Record<BusinessDocumentKindName, string> = { INVOICE: "COB", PROPOSAL: "PRO", CONTRACT: "CON" };

export function documentNumberLabel(kind: BusinessDocumentKindName, number: number | null): string {
  return number ? `${PREFIX[kind]}-${String(number).padStart(4, "0")}` : "Borrador";
}

export function computeTotals<T extends DocumentItemInput>(items: T[], discountAmount = 0) {
  const tooLarge = () => new BadRequestException("El total supera el máximo permitido para un documento");
  const priced = items.map((item) => {
    const amount = item.quantity * item.unitAmount;
    if (amount > MAX_DOCUMENT_AMOUNT) throw tooLarge();
    return { ...item, amount };
  });
  const subtotalAmount = priced.reduce((sum, item) => sum + item.amount, 0);
  if (subtotalAmount > MAX_DOCUMENT_AMOUNT) throw tooLarge();
  if (discountAmount > subtotalAmount) throw new BadRequestException("El descuento no puede ser mayor que el subtotal");
  return { items: priced, subtotalAmount, discountAmount, totalAmount: subtotalAmount - discountAmount };
}

function cleanBlocks(content: unknown): DocumentBlock[] {
  if (!Array.isArray(content)) return [];
  return content.map((raw: DocumentBlock) => ({
    type: raw.type,
    ...(raw.title !== undefined && { title: raw.title }),
    ...(raw.text !== undefined && { text: raw.text }),
    ...(raw.items !== undefined && { items: [...raw.items] }),
  }));
}

export function buildSnapshot(source: SnapshotSource): DocumentSnapshot {
  return {
    kind: source.kind,
    numberLabel: documentNumberLabel(source.kind, source.number),
    title: source.title,
    currency: source.currency,
    customer: {
      name: source.customerName ?? null,
      email: source.customerEmail ?? null,
      phone: source.customerPhone ?? null,
      document: source.customerDocument ?? null,
    },
    items: [...source.items]
      .sort((a, b) => a.position - b.position)
      .map(({ description, quantity, unitAmount, amount }) => ({ description, quantity, unitAmount, amount })),
    subtotalAmount: source.subtotalAmount,
    discountAmount: source.discountAmount,
    totalAmount: source.totalAmount,
    dueAt: source.dueAt ? source.dueAt.toISOString() : null,
    validUntil: source.validUntil ? source.validUntil.toISOString() : null,
    blocks: cleanBlocks(source.content),
  };
}

/** JSON with object keys sorted at every depth, so the hash does not depend on key order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry === undefined ? null : entry)).join(",")}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}

export function snapshotSha256(snapshot: DocumentSnapshot): string {
  return sha256Hex(canonicalJson(snapshot));
}

/**
 * `{{…}}` left by a template or by AI drafting for data the merchant must still fill in.
 * `extra` holds texts sent alongside the snapshot, such as the email message.
 */
export function findPlaceholders(snapshot: DocumentSnapshot, extra: Array<string | null | undefined> = []): string[] {
  const texts = [
    snapshot.title,
    snapshot.customer.name,
    snapshot.customer.email,
    snapshot.customer.phone,
    snapshot.customer.document,
    ...snapshot.items.map((item) => item.description),
    ...snapshot.blocks.flatMap((block) => [block.title, block.text, ...(block.items ?? [])]),
    ...extra,
  ];
  const found = texts.flatMap((text) => text?.match(/\{\{[^{}]{1,80}\}\}/g) ?? []);
  return [...new Set(found)];
}
