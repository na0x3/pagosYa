import { inflateSync } from "node:zlib";
import { renderContractPdf, type ContractPdfSignature } from "./contract-pdf";
import { buildSnapshot } from "./business-document-snapshot";

/** Same reader as business-document-pdf.spec.ts: inflate the streams, then read the TJ/Tj hex runs. */
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
  return runs.map((run) => (run.match(/<[0-9a-fA-F]+>/g) || []).map((hex) => Buffer.from(hex.slice(1, -1), "hex").toString("latin1")).join("")).join("\n");
}
const flat = (buffer: Buffer) => text(buffer).replace(/\s+/g, "");

const snapshot = buildSnapshot({
  kind: "CONTRACT",
  number: 3,
  title: "Contrato de diseño",
  currency: "BOB",
  customerName: "Cafe Illimani",
  customerEmail: "compras@illimani.bo",
  customerPhone: null,
  customerDocument: "7788990",
  subtotalAmount: 0,
  discountAmount: 0,
  totalAmount: 0,
  dueAt: null,
  validUntil: null,
  items: [],
  content: [
    { type: "contract", contract: { contractType: "servicios", city: "La Paz", signingOrder: "merchant_first", merchantParty: { legalName: "Estudio Andino SRL", document: "1020304050", representative: "", representativeDocument: "", address: "Av. Arce 123", email: "hola@andino.bo" }, customerParty: { address: "Calacoto 45", representative: "", representativeDocument: "" } } },
    { type: "clause", title: "Objeto", text: "EL PRESTADOR disenara la identidad visual." },
  ],
});
const sha = "a".repeat(64);
const signatures: ContractPdfSignature[] = [
  { role: "MERCHANT", name: "Ana Quispe", method: "TYPED", email: "hola@andino.bo", signedAt: new Date("2026-09-25T14:00:00Z"), ipAddress: "10.0.0.1", userAgent: "Mozilla/5.0 Mac", codeVerifiedAt: null, imageUrl: null, versionSha256: sha },
  { role: "CUSTOMER", name: "Luis Mamani", method: "TYPED", email: "compras@illimani.bo", signedAt: new Date("2026-09-25T18:03:07Z"), ipAddress: "181.115.1.2", userAgent: "Mozilla/5.0 iPhone", codeVerifiedAt: new Date("2026-09-25T18:02:00Z"), imageUrl: null, versionSha256: sha },
];

describe("renderContractPdf", () => {
  it("prints the contract (parties, numbered clauses, closing) and the evidence page with every signer", async () => {
    const buffer = await renderContractPdf({ storeName: "Andino", numberLabel: "CON-0003", version: 1, sha256: sha, snapshot, signatures });
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    const all = flat(buffer);
    for (const expected of ["CON-0003", "Contratodediseño", "PRIMERA.-(PARTES)", "EstudioAndinoSRL", "SEGUNDA.-(OBJETO)", "DOMICILIOS", "Registrodefirmaelectrónica", "AnaQuispe", "LuisMamani", "181.115.1.2", "25/09/202614:03:07", "a".repeat(64), "Códigoverificado", "firmaelectrónicasimple"]) {
      expect(all).toContain(expected);
    }
  });

  it("an unsigned contract says it is pending and has no evidence page", async () => {
    const all = flat(await renderContractPdf({ storeName: "Andino", numberLabel: "CON-0003", version: 1, sha256: sha, snapshot, signatures: [] }));
    expect(all).toContain("Pendientedefirma");
    expect(all).not.toContain("Registrodefirmaelectrónica");
  });

  it("a voided contract keeps only its identity and the stamp", async () => {
    const all = flat(await renderContractPdf({ storeName: "Andino", numberLabel: "CON-0003", version: 1, sha256: sha, snapshot, signatures, voidedAt: "2026-09-26T12:00:00Z" }));
    expect(all).toContain("ANULADO");
    expect(all).not.toContain("EstudioAndinoSRL");
    expect(all).not.toContain("181.115.1.2");
  });
});
