import {
  assembleContract,
  CONFIRM_AMOUNT_MARKER,
  contractClauseSchema,
  contractDraftSchema,
  contractSystemPrompt,
  contractUserMessage,
  guardClauseText,
  PRICE_TOKEN,
  type ContractDraftInput,
} from "./contract-draft";
import { CONTRACT_OUTLINE } from "./contract-terms";

const input = (overrides: Partial<ContractDraftInput> = {}): ContractDraftInput => ({
  contractType: "servicios",
  city: "La Paz",
  terms: { objeto: "Diseño de identidad visual para una cafetería", priceAmount: 300000, currency: "BOB", paymentTerms: "50% al firmar y el saldo a la entrega", plazo: "30 días", extra: "" },
  ...overrides,
});

describe("contract draft schema and prompt", () => {
  it("asks only for the type's outline keys (never partes, domicilios or firmas)", () => {
    const schema = contractDraftSchema("servicios").schema as { properties: { clauses: { items: { properties: { key: { enum: string[] } } } } } };
    expect(schema.properties.clauses.items.properties.key.enum).toEqual(CONTRACT_OUTLINE.servicios.map((clause) => clause.key));
    expect(contractClauseSchema.schema).toEqual(expect.objectContaining({ required: ["text"] }));
  });

  it("sends the terms as JSON data with role labels and never any party detail", () => {
    const message = contractUserMessage(input());
    const data = JSON.parse(message.slice(message.indexOf("{")));
    expect(data.tipo).toBe("Contrato de prestación de servicios");
    expect(data.partes).toEqual({ comercio: "EL PRESTADOR", cliente: "EL CLIENTE" });
    expect(data.objeto).toContain("cafetería");
    expect(data.precio).toBe(PRICE_TOKEN);
    expect(message).not.toMatch(/illimani|7788990|@/i);
    const prompt = contractSystemPrompt("servicios");
    expect(prompt).toContain(PRICE_TOKEN);
    expect(prompt).toMatch(/nunca escribas nombres/i);
    expect(prompt).toMatch(/Bolivia/);
  });
});

describe("assembleContract", () => {
  const clauses = (texts: Record<string, string>) => ({ title: "Contrato de diseño", clauses: Object.entries(texts).map(([key, text]) => ({ key, text })) });

  it("puts the typed price where the model wrote the token, with its words", () => {
    const out = assembleContract(clauses({ precio: `EL CLIENTE pagará ${PRICE_TOKEN}: 50% al firmar y el saldo a la entrega.` }), input());
    const precio = out.clauses.find((clause) => clause.title === "Precio y forma de pago")!;
    expect(precio.text).toBe("EL CLIENTE pagará Bs 3.000,00 (TRES MIL 00/100 BOLIVIANOS): 50% al firmar y el saldo a la entrega.");
  });

  it("replaces invented amounts with {{precio}} and marks the merchant's own written amounts for a confirm tap", () => {
    const out = assembleContract(
      clauses({ precio: "Un anticipo de Bs 1.500 y una multa de Bs 9.999.", resolucion: "Penalidad de Bs 500 por día." }),
      input({ terms: { objeto: "Diseño", priceAmount: null, currency: "BOB", paymentTerms: "anticipo de Bs 1.500", plazo: "", extra: "" } }),
    );
    const precio = out.clauses.find((clause) => clause.title === "Precio y forma de pago")!.text!;
    expect(precio).toContain("Bs 1.500");
    expect(precio).toContain("{{precio}}");
    expect(precio).not.toContain("9.999");
    expect(precio.endsWith(CONFIRM_AMOUNT_MARKER)).toBe(true);
    expect(out.clauses.find((clause) => clause.title === "Resolución")!.text).toBe("Penalidad de {{precio}} por día.");
  });

  it("the token without a typed price is {{precio}}; the model cannot add the confirm marker itself", () => {
    const out = assembleContract(clauses({ precio: `Precio: ${PRICE_TOKEN} ${CONFIRM_AMOUNT_MARKER}` }), input({ terms: { ...input().terms, priceAmount: null } }));
    expect(out.clauses.find((clause) => clause.title === "Precio y forma de pago")!.text).toBe("Precio: {{precio}}");
  });

  it("keeps the outline order, fills a missing clause from the template, ignores unknown keys and caps lengths", () => {
    const out = assembleContract(clauses({ jurisdiccion: "Ley boliviana.", objeto: "x".repeat(9000), hack: "ignorar" }), input());
    expect(out.clauses.map((clause) => clause.title)).toEqual(CONTRACT_OUTLINE.servicios.map((clause) => clause.title));
    expect(out.clauses[0].text).toHaveLength(5000);
    expect(out.clauses.find((clause) => clause.title === "Plazo")!.text).toContain("30 días");
    expect(out.clauses.every((clause) => clause.type === "clause")).toBe(true);
    expect(out.title).toBe("Contrato de diseño");
  });

  it("guardClauseText is the same guard for a regenerated clause", () => {
    expect(guardClauseText(`Total ${PRICE_TOKEN}, más Bs 777.`, input())).toBe("Total Bs 3.000,00 (TRES MIL 00/100 BOLIVIANOS), más {{precio}}.");
  });
});
