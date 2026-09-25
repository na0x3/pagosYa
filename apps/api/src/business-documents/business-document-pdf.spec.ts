import { inflateSync } from "node:zlib";
import { renderBusinessDocumentPdf } from "./business-document-pdf";
import type { DocumentSnapshot } from "./business-document-snapshot";

/** Same reader as reports/finance-pdfs.spec.ts: inflate the streams, then read the TJ/Tj hex runs. */
function text(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  let inflated = "";
  const pattern = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      inflated += inflateSync(Buffer.from(raw.slice(start, end), "latin1")).toString("latin1");
    } catch {
      // Not a Flate stream.
    }
  }
  const runs = inflated.match(/\[[^\]]*\]\s*TJ|<[0-9a-fA-F]+>\s*Tj/g) || [];
  return runs
    .map((run) => (run.match(/<[0-9a-fA-F]+>/g) || []).map((hex) => Buffer.from(hex.slice(1, -1), "hex").toString("latin1")).join(""))
    .join("\n");
}

const snapshot: DocumentSnapshot = {
  kind: "INVOICE",
  numberLabel: "COB-0001",
  title: "Diseño de logo",
  currency: "BOB",
  customer: { name: "Ana Quispe", email: "ana@example.com", phone: "+591 71234567", document: "4567890" },
  items: [
    { description: "Boceto inicial", quantity: 2, unitAmount: 1500, amount: 3000 },
    { description: "Revisión final", quantity: 1, unitAmount: 250, amount: 250 },
  ],
  subtotalAmount: 3250,
  discountAmount: 250,
  totalAmount: 3000,
  dueAt: "2026-10-01T12:00:00.000Z",
  validUntil: null,
  blocks: [
    { type: "heading", text: "Condiciones" },
    { type: "paragraph", text: "El pago se realiza por QR." },
    { type: "list", items: ["Incluye dos revisiones"] },
    { type: "clause", title: "Entrega", text: "Archivos en PDF y PNG." },
  ],
};
const sha256 = "0123456789abcdef".repeat(4);

describe("renderBusinessDocumentPdf", () => {
  it("draws the store, number, customer, items, totals, blocks and the version footer", async () => {
    const pdf = await renderBusinessDocumentPdf({ storeName: "Estudio Illimani", numberLabel: "COB-0001", version: 2, sha256, snapshot });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const content = text(pdf);
    for (const expected of [
      "Estudio Illimani", "COBRO", "COB-0001", "Diseño de logo", "Ana Quispe", "ana@example.com",
      "Boceto inicial", "Revisión final", "32,50 BOB", "2,50 BOB", "30,00 BOB",
      "Condiciones", "El pago se realiza por QR.", "Incluye dos revisiones", "Entrega", "Archivos en PDF y PNG.",
      "COB-0001 · v2 · sha256 0123456789ab",
    ]) expect(content).toContain(expected);
  });

  it("repeats the footer on every page of a long document", async () => {
    const items = Array.from({ length: 90 }, (_, i) => ({ description: `Ítem número ${i + 1}`, quantity: 1, unitAmount: 100, amount: 100 }));
    const pdf = await renderBusinessDocumentPdf({
      storeName: "Tienda", numberLabel: "PRO-0003", version: 1, sha256,
      snapshot: { ...snapshot, kind: "PROPOSAL", numberLabel: "PRO-0003", items, subtotalAmount: 9000, discountAmount: 0, totalAmount: 9000 },
    });
    const content = text(pdf);
    const footers = content.match(/PRO-0003 · v1 · sha256 0123456789ab/g) ?? [];
    expect(footers.length).toBeGreaterThanOrEqual(2);
    expect(content).toContain(`Página ${footers.length} de ${footers.length}`);
    expect(content).toContain("Ítem número 90");
  });

  it("renders a document with no items, no customer and no blocks", async () => {
    const empty: DocumentSnapshot = {
      ...snapshot, kind: "CONTRACT", numberLabel: "Borrador", items: [], subtotalAmount: 0, discountAmount: 0, totalAmount: 0,
      customer: { name: null, email: null, phone: null, document: null }, blocks: [], dueAt: null,
    };
    const pdf = await renderBusinessDocumentPdf({ storeName: "Tienda", numberLabel: "Borrador", version: 0, sha256: "", snapshot: empty });
    expect(text(pdf)).toContain("CONTRATO");
  });
});
