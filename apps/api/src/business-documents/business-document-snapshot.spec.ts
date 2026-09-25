import { BadRequestException } from "@nestjs/common";
import {
  buildSnapshot,
  canonicalJson,
  computeTotals,
  documentNumberLabel,
  findPlaceholders,
  snapshotSha256,
} from "./business-document-snapshot";

const base = {
  kind: "INVOICE" as const,
  number: 1,
  title: "Diseño de logo",
  currency: "BOB",
  customerName: "Ana Quispe",
  customerEmail: "ana@example.com",
  customerPhone: null,
  customerDocument: null,
  subtotalAmount: 3250,
  discountAmount: 250,
  totalAmount: 3000,
  dueAt: new Date("2026-10-01T00:00:00Z"),
  validUntil: null,
  content: [{ type: "paragraph", text: "Gracias por su preferencia." }],
  items: [
    { position: 0, description: "Boceto", quantity: 2, unitAmount: 1500, amount: 3000, paymentLinkId: "pl_1" },
    { position: 1, description: "Revisión", quantity: 1, unitAmount: 250, amount: 250, paymentLinkId: null },
  ],
};

describe("computeTotals", () => {
  it("sums quantity × unit per line, then takes the document discount off", () => {
    const totals = computeTotals([{ description: "a", quantity: 2, unitAmount: 1500 }, { description: "b", quantity: 1, unitAmount: 250 }], 250);
    expect(totals.items.map((item) => item.amount)).toEqual([3000, 250]);
    expect(totals).toMatchObject({ subtotalAmount: 3250, discountAmount: 250, totalAmount: 3000 });
  });

  it("refuses a discount larger than the subtotal", () => {
    expect(() => computeTotals([{ description: "a", quantity: 1, unitAmount: 100 }], 101)).toThrow(BadRequestException);
  });

  it("refuses totals the integer columns cannot hold", () => {
    expect(() => computeTotals([{ description: "a", quantity: 100_000, unitAmount: 1_000_000_000 }], 0)).toThrow(BadRequestException);
    expect(() => computeTotals([
      { description: "a", quantity: 1, unitAmount: 1_500_000_000 },
      { description: "b", quantity: 1, unitAmount: 1_500_000_000 },
    ], 0)).toThrow(BadRequestException);
  });
});

describe("snapshot and hash", () => {
  it("serialises the same value identically whatever the key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [{ f: 1, e: 2 }] } })).toBe(canonicalJson({ a: { c: [{ e: 2, f: 1 }], d: 2 }, b: 1 }));
  });

  it("keeps only public fields and hashes them reproducibly", () => {
    const snapshot = buildSnapshot(base);
    expect(snapshot).toEqual({
      kind: "INVOICE",
      numberLabel: "COB-0001",
      title: "Diseño de logo",
      currency: "BOB",
      customer: { name: "Ana Quispe", email: "ana@example.com", phone: null, document: null },
      items: [
        { description: "Boceto", quantity: 2, unitAmount: 1500, amount: 3000 },
        { description: "Revisión", quantity: 1, unitAmount: 250, amount: 250 },
      ],
      subtotalAmount: 3250,
      discountAmount: 250,
      totalAmount: 3000,
      dueAt: "2026-10-01T00:00:00.000Z",
      validUntil: null,
      blocks: [{ type: "paragraph", text: "Gracias por su preferencia." }],
    });
    expect(snapshotSha256(snapshot)).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshotSha256(buildSnapshot({ ...base }))).toBe(snapshotSha256(snapshot));
    // The stored JSON round-trips to the same hash: the sha can be checked from the row alone.
    expect(snapshotSha256(JSON.parse(JSON.stringify(snapshot)))).toBe(snapshotSha256(snapshot));
    expect(snapshotSha256(buildSnapshot({ ...base, title: "Otro" }))).not.toBe(snapshotSha256(snapshot));
  });

  it("orders items by position", () => {
    const snapshot = buildSnapshot({ ...base, items: [...base.items].reverse() });
    expect(snapshot.items.map((item) => item.description)).toEqual(["Boceto", "Revisión"]);
  });
});

describe("findPlaceholders", () => {
  it("finds unfilled {{placeholders}} in the title, items and blocks, once each", () => {
    const snapshot = buildSnapshot({
      ...base,
      title: "Contrato con {{cliente}}",
      items: [{ ...base.items[0], description: "Servicio para {{cliente}}" }],
      content: [{ type: "clause", title: "Plazo", text: "Desde {{fecha de inicio}}" }, { type: "list", items: ["{{ciudad}}"] }],
    });
    expect(findPlaceholders(snapshot)).toEqual(["{{cliente}}", "{{fecha de inicio}}", "{{ciudad}}"]);
    expect(findPlaceholders(buildSnapshot(base))).toEqual([]);
  });
});

describe("documentNumberLabel", () => {
  it("labels each kind with its own prefix and drafts as Borrador", () => {
    expect(documentNumberLabel("INVOICE", 7)).toBe("COB-0007");
    expect(documentNumberLabel("PROPOSAL", 12345)).toBe("PRO-12345");
    expect(documentNumberLabel("CONTRACT", null)).toBe("Borrador");
  });
});
