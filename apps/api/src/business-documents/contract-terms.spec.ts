import {
  amountInWords,
  CONTRACT_OUTLINE,
  CONTRACT_TYPES,
  cleanContractMeta,
  contractMoney,
  contractSnapshot,
  contractTemplateClauses,
  defaultContractMeta,
  prefillMerchantParty,
  splitContractContent,
} from "./contract-terms";
import { buildSnapshot, findPlaceholders, snapshotSha256, type SnapshotSource } from "./business-document-snapshot";

const meta = {
  contractType: "servicios" as const,
  city: "La Paz",
  signingOrder: "merchant_first" as const,
  merchantParty: { legalName: "Estudio Andino SRL", document: "1020304050", representative: "Ana Quispe", representativeDocument: "4455667 LP", address: "Av. Arce 123, La Paz", email: "hola@andino.bo" },
  customerParty: { address: "Calle 21 de Calacoto 45", representative: "", representativeDocument: "" },
};

const source = (overrides: Partial<SnapshotSource> = {}): SnapshotSource => ({
  kind: "CONTRACT",
  number: 1,
  title: "Contrato de prestación de servicios",
  currency: "BOB",
  customerName: "Café Illimani",
  customerEmail: "compras@illimani.bo",
  customerPhone: null,
  customerDocument: "7788990",
  subtotalAmount: 0,
  discountAmount: 0,
  totalAmount: 0,
  dueAt: null,
  validUntil: null,
  content: [{ type: "contract", contract: meta }, { type: "clause", title: "Objeto", text: "EL PRESTADOR diseñará la identidad visual." }],
  items: [],
  ...overrides,
});

describe("contract types and outlines", () => {
  it("has the five types, each with objeto and jurisdicción clauses and never partes/domicilios (the server writes those)", () => {
    expect(CONTRACT_TYPES).toEqual(["servicios", "compraventa", "alquiler", "confidencialidad", "personalizado"]);
    for (const type of CONTRACT_TYPES) {
      const keys = CONTRACT_OUTLINE[type].map((clause) => clause.key);
      expect(keys[0]).toBe("objeto");
      expect(keys).toContain("jurisdiccion");
      expect(keys).not.toContain("partes");
      expect(keys).not.toContain("domicilios");
    }
    expect(CONTRACT_OUTLINE.servicios.map((clause) => clause.key)).toEqual(expect.arrayContaining(["precio", "plazo", "confidencialidad", "resolucion"]));
    expect(CONTRACT_OUTLINE.confidencialidad.map((clause) => clause.key)).not.toContain("precio");
  });
});

describe("cleanContractMeta", () => {
  it("keeps known fields, trims, caps lengths and falls back to safe defaults", () => {
    const cleaned = cleanContractMeta({ contractType: "hack", city: `  ${"x".repeat(200)} `, signingOrder: "whatever", merchantParty: { legalName: "  A  ", evil: "<script>" }, extra: 1 });
    expect(cleaned.contractType).toBe("personalizado");
    expect(cleaned.signingOrder).toBe("merchant_first");
    expect(cleaned.city).toHaveLength(60);
    expect(cleaned.merchantParty.legalName).toBe("A");
    expect(cleaned.merchantParty).not.toHaveProperty("evil");
    expect(cleaned).not.toHaveProperty("extra");
    expect(cleaned.customerParty).toEqual({ address: "", representative: "", representativeDocument: "" });
  });
});

describe("prefillMerchantParty", () => {
  it("prefers the invoicing profile, then the approved KYC, then the store name; email from the store contact, else the account", () => {
    expect(prefillMerchantParty({
      invoicing: { razonSocial: "Estudio Andino SRL", nit: "1020304050" },
      kyc: { legalName: "Otro", taxId: "999", legalRepName: "Ana Quispe", legalRepDocumentId: "4455667" },
      store: { name: "Andino", contactEmail: "hola@andino.bo" },
      merchantEmail: "cuenta@andino.bo",
    })).toEqual({ legalName: "Estudio Andino SRL", document: "1020304050", representative: "Ana Quispe", representativeDocument: "4455667", address: "", email: "hola@andino.bo" });
    expect(prefillMerchantParty({ invoicing: null, kyc: null, store: { name: "Andino", contactEmail: null }, merchantEmail: "cuenta@andino.bo" }))
      .toEqual({ legalName: "Andino", document: "", representative: "", representativeDocument: "", address: "", email: "cuenta@andino.bo" });
  });
});

describe("money in contracts", () => {
  it("writes an amount with its words, the Bolivian way", () => {
    expect(amountInWords(150000, "BOB")).toBe("MIL QUINIENTOS 00/100 BOLIVIANOS");
    expect(amountInWords(2135050, "BOB")).toBe("VEINTIÚN MIL TRESCIENTOS CINCUENTA 50/100 BOLIVIANOS");
    expect(amountInWords(100000000, "USD")).toBe("UN MILLÓN 00/100 DÓLARES ESTADOUNIDENSES");
    expect(contractMoney(150000, "BOB")).toBe("Bs 1.500,00 (MIL QUINIENTOS 00/100 BOLIVIANOS)");
  });
});

describe("templates (Empezar sin IA)", () => {
  it("builds the type's outline with the merchant's terms and placeholders for what is missing", () => {
    const clauses = contractTemplateClauses("servicios", { objeto: "Diseño de identidad visual", priceAmount: 150000, currency: "BOB", paymentTerms: "", plazo: "" });
    expect(clauses.map((clause) => clause.title)).toEqual(CONTRACT_OUTLINE.servicios.map((clause) => clause.title));
    const text = clauses.map((clause) => clause.text).join("\n");
    expect(text).toContain("Diseño de identidad visual");
    expect(text).toContain("Bs 1.500,00 (MIL QUINIENTOS 00/100 BOLIVIANOS)");
    expect(text).toContain("{{forma de pago}}");
    expect(text).toContain("{{plazo}}");
    const empty = contractTemplateClauses("compraventa", { objeto: "", priceAmount: null, currency: "BOB", paymentTerms: "", plazo: "" }).map((clause) => clause.text).join("\n");
    expect(empty).toContain("{{objeto}}");
    expect(empty).toContain("{{precio}}");
  });
});

describe("contract snapshot", () => {
  it("freezes issuer and parties (hashed) and keeps only clauses as blocks", () => {
    const snapshot = buildSnapshot(source());
    expect(snapshot.blocks).toEqual([{ type: "clause", title: "Objeto", text: "EL PRESTADOR diseñará la identidad visual." }]);
    expect(snapshot.contract?.merchantParty.legalName).toBe("Estudio Andino SRL");
    expect(snapshot.contract?.customerParty).toEqual(expect.objectContaining({ name: "Café Illimani", document: "7788990", email: "compras@illimani.bo", address: "Calle 21 de Calacoto 45" }));
    expect(snapshot.contract?.partes).toContain("Estudio Andino SRL");
    expect(snapshot.contract?.partes).toContain("NIT 1020304050");
    expect(snapshot.contract?.partes).toContain("«EL PRESTADOR»");
    expect(snapshot.contract?.partes).toContain("Café Illimani");
    expect(snapshot.contract?.domicilios).toContain("compras@illimani.bo");
    expect(snapshot.contract?.closing).toContain("La Paz");
    expect(findPlaceholders(snapshot)).toEqual([]);
    const changed = buildSnapshot(source({ content: [{ type: "contract", contract: { ...meta, merchantParty: { ...meta.merchantParty, document: "999" } } }, { type: "clause", title: "Objeto", text: "EL PRESTADOR diseñará la identidad visual." }] }));
    expect(snapshotSha256(changed)).not.toBe(snapshotSha256(snapshot));
  });

  it("turns missing party data into placeholders that block the send", () => {
    const snapshot = buildSnapshot(source({ customerDocument: null, customerEmail: null, content: [{ type: "contract", contract: { ...meta, city: "", merchantParty: { ...meta.merchantParty, address: "" } } }] }));
    expect(findPlaceholders(snapshot)).toEqual(expect.arrayContaining(["{{CI o NIT del cliente}}", "{{correo del cliente}}", "{{ciudad}}", "{{domicilio del comercio}}"]));
  });

  it("a contract with no meta block gets the defaults (and their placeholders)", () => {
    const snapshot = buildSnapshot(source({ content: [] }));
    expect(snapshot.contract?.contractType).toBe("personalizado");
    expect(findPlaceholders(snapshot)).toContain("{{NIT o CI del comercio}}");
  });

  it("never changes a cobro or proposal: a stray contract block is dropped and there is no contract field", () => {
    const invoice = source({ kind: "INVOICE", content: [{ type: "paragraph", text: "Gracias" }] });
    const before = snapshotSha256(buildSnapshot(invoice));
    const withStray = buildSnapshot({ ...invoice, content: [{ type: "contract", contract: meta }, { type: "paragraph", text: "Gracias" }] });
    expect(withStray).not.toHaveProperty("contract");
    expect(withStray.blocks).toEqual([{ type: "paragraph", text: "Gracias" }]);
    expect(snapshotSha256(withStray)).toBe(before);
  });

  it("splitContractContent returns the meta (cleaned) and the clauses", () => {
    const { meta: found, clauses } = splitContractContent([{ type: "clause", title: "A", text: "a" }, { type: "contract", contract: meta }]);
    expect(found.merchantParty.legalName).toBe("Estudio Andino SRL");
    expect(clauses).toEqual([{ type: "clause", title: "A", text: "a" }]);
    expect(splitContractContent("nope").meta).toEqual(defaultContractMeta());
    expect(contractSnapshot(defaultContractMeta(), { name: null, document: null, email: null }).roles).toEqual({ merchant: "PRIMERA PARTE", customer: "SEGUNDA PARTE" });
  });
});
