import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONFIRM_AMOUNT_MARKER,
  CONTRACT_EXAMPLES,
  CONTRACT_STATE_LABEL,
  CONTRACT_TYPES,
  confirmAmount,
  contractPayload,
  contractPending,
  contractState,
  contractTimeline,
  draftPayload,
  editorFromDocument,
  moveClause,
  pendingSummary,
  signingLine,
  whatsAppContractMessage,
} from "./contracts.mjs";

const NOW = new Date("2026-09-25T15:00:00.000Z");
const meta = {
  contractType: "servicios",
  city: "La Paz",
  signingOrder: "merchant_first",
  merchantParty: { legalName: "Estudio Andino SRL", document: "1020304050", representative: "", representativeDocument: "", address: "Av. Arce 123", email: "hola@andino.bo" },
  customerParty: { address: "Calacoto 45", representative: "", representativeDocument: "" },
};
const doc = (overrides = {}) => ({
  id: "doc_1",
  numberLabel: "CON-0001",
  status: "SENT",
  title: "Contrato de diseño",
  currentVersion: 1,
  editTag: "tag1",
  validUntil: "2026-10-25T03:59:59.000Z",
  customer: { name: "Café Illimani", email: "compras@illimani.bo", phone: "70000001", document: "7788990" },
  content: [{ type: "contract", contract: meta }, { type: "clause", title: "Objeto", text: "EL PRESTADOR diseñará." }],
  signing: { merchantSigned: false, customerSigned: false, order: "merchant_first", waitingFor: "merchant" },
  ...overrides,
});

test("the five types and the first-run examples", () => {
  assert.deepEqual(CONTRACT_TYPES.map((type) => type.id), ["servicios", "compraventa", "alquiler", "confidencialidad", "personalizado"]);
  assert.ok(CONTRACT_TYPES.find((type) => type.id === "alquiler").notice.includes("abogado o notario"));
  assert.equal(CONTRACT_EXAMPLES.length, 4);
  assert.ok(CONTRACT_EXAMPLES.every((example) => CONTRACT_TYPES.some((type) => type.id === example.contractType) && example.objeto.length > 10));
});

test("status chips: borrador, enviado, visto, firmado por ti, firmado por el cliente, firmado, anulado, vencido", () => {
  assert.equal(contractState(doc({ status: "DRAFT", currentVersion: 0 }), NOW), "draft");
  assert.equal(contractState(doc(), NOW), "sent");
  assert.equal(contractState(doc({ status: "VIEWED" }), NOW), "viewed");
  assert.equal(contractState(doc({ status: "VIEWED", signing: { merchantSigned: true, customerSigned: false } }), NOW), "signed_you");
  assert.equal(contractState(doc({ status: "VIEWED", signing: { merchantSigned: false, customerSigned: true } }), NOW), "signed_customer");
  assert.equal(contractState(doc({ status: "SIGNED" }), NOW), "signed");
  assert.equal(contractState(doc({ status: "VOIDED" }), NOW), "voided");
  assert.equal(contractState(doc({ status: "EXPIRED" }), NOW), "expired");
  assert.equal(contractState(doc({ validUntil: "2026-09-20T00:00:00.000Z" }), NOW), "expired");
  assert.deepEqual(Object.values(CONTRACT_STATE_LABEL), ["Borrador", "Enviado", "Visto", "Firmado por ti", "Firmado por el cliente", "Firmado", "Anulado", "Vencido"]);
});

test("signingLine says who signs next", () => {
  assert.equal(signingLine(doc()), "Te toca firmar");
  assert.equal(signingLine(doc({ signing: { merchantSigned: true, customerSigned: false, waitingFor: "customer" } })), "Esperando la firma de Café Illimani");
  assert.equal(signingLine(doc({ status: "SIGNED" })), "Firmado por ambas partes");
  assert.equal(signingLine(doc({ status: "DRAFT", currentVersion: 0 })), "Borrador sin enviar");
});

test("the editor reads the contract block and the clauses; the payload writes them back with the meta first", () => {
  const editor = editorFromDocument(doc());
  assert.equal(editor.meta.merchantParty.legalName, "Estudio Andino SRL");
  assert.deepEqual(editor.clauses, [{ title: "Objeto", text: "EL PRESTADOR diseñará." }]);
  assert.equal(editor.customer.document, "7788990");
  editor.clauses.push({ title: "Nueva", text: "Texto" });
  const payload = contractPayload(editor);
  assert.equal(payload.content[0].type, "contract");
  assert.deepEqual(payload.content[0].contract, meta);
  assert.deepEqual(payload.content.slice(1), [{ type: "clause", title: "Objeto", text: "EL PRESTADOR diseñará." }, { type: "clause", title: "Nueva", text: "Texto" }]);
  assert.equal(payload.customerDocument, "7788990");
  assert.equal(payload.customerEmail, "compras@illimani.bo");
  assert.equal(payload.validUntil, "2026-10-25T03:59:59.000Z");
  // A cleared email is sent as null (D0 clears it), never as an empty string.
  editor.customer.email = " ";
  assert.equal(contractPayload(editor).customerEmail, null);
});

test("pending data names every missing party field, placeholder and amount to confirm", () => {
  const editor = editorFromDocument(doc({ customer: { name: "Café Illimani", email: "", phone: "", document: "" } }));
  editor.meta.merchantParty.address = "";
  editor.meta.city = "";
  editor.clauses = [
    { title: "Precio y forma de pago", text: `Bs 1.500 al firmar. ${CONFIRM_AMOUNT_MARKER}` },
    { title: "Plazo", text: "Durante {{plazo}}." },
  ];
  const rows = contractPending(editor);
  assert.deepEqual(rows.map((row) => row.label), [
    "Tu domicilio (comercio)",
    "CI o NIT del cliente",
    "Correo del cliente (ahí le llega el código para firmar)",
    "Ciudad del contrato",
    "Confirma el monto de «Precio y forma de pago»",
    "«Plazo»: completa {{plazo}}",
  ]);
  assert.deepEqual(rows.map((row) => row.where), ["merchant:address", "customer:document", "customer:email", "city", "clause:0", "clause:1"]);
  assert.equal(pendingSummary(rows), "Faltan 6 datos");
  assert.equal(pendingSummary(rows.slice(0, 1)), "Falta 1 dato");
  assert.deepEqual(contractPending(editorFromDocument(doc())), []);
});

test("confirming an amount removes only the marker; clauses move within bounds", () => {
  assert.equal(confirmAmount(`Bs 1.500 al firmar. ${CONFIRM_AMOUNT_MARKER}`), "Bs 1.500 al firmar.");
  const clauses = [{ title: "A" }, { title: "B" }, { title: "C" }];
  assert.deepEqual(moveClause(clauses, 0, 1).map((clause) => clause.title), ["B", "A", "C"]);
  assert.deepEqual(moveClause(clauses, 0, -1).map((clause) => clause.title), ["A", "B", "C"]);
  assert.deepEqual(clauses.map((clause) => clause.title), ["A", "B", "C"]);
});

test("the draft request carries the typed price in centavos and only what the merchant filled", () => {
  assert.deepEqual(draftPayload({ contractType: "servicios", objeto: " Diseño de logo ", price: "1.500,50", paymentTerms: "50% al firmar", plazo: "", city: "La Paz", extra: "", signingOrder: "customer_first", customerName: "Café", customerDocument: "", customerEmail: "A@B.BO", customerPhone: "", customerAddress: "", fromProposalId: null }, { ai: true }), {
    contractType: "servicios", objeto: "Diseño de logo", priceAmount: 150050, paymentTerms: "50% al firmar", city: "La Paz", signingOrder: "customer_first", customerName: "Café", customerEmail: "a@b.bo", ai: true,
  });
  assert.equal(draftPayload({ contractType: "alquiler", objeto: "Equipo", price: "abc", city: "Sucre", signingOrder: "merchant_first", fromProposalId: "p1" }, { ai: false }).priceAmount, undefined);
  assert.equal(draftPayload({ contractType: "alquiler", objeto: "Equipo", price: "", city: "Sucre", signingOrder: "merchant_first", fromProposalId: "p1" }, { ai: false }).fromProposalId, "p1");
});

test("timeline and the WhatsApp message", () => {
  const entries = contractTimeline([
    { id: "1", type: "created", at: "2026-09-25T12:00:00Z", data: null },
    { id: "2", type: "sent", version: 1, at: "2026-09-25T12:01:00Z", data: {} },
    { id: "3", type: "signed", version: 1, at: "2026-09-25T12:02:00Z", data: { role: "MERCHANT", name: "Ana" } },
    { id: "4", type: "sign_code_sent", version: 1, at: "2026-09-25T12:03:00Z", data: { to: "c***@illimani.bo" } },
    { id: "5", type: "sign_code_verified", version: 1, at: "2026-09-25T12:04:00Z", data: {} },
    { id: "6", type: "signed", version: 1, at: "2026-09-25T12:05:00Z", data: { role: "CUSTOMER", name: "Luis" } },
    { id: "7", type: "fully_signed", version: 1, at: "2026-09-25T12:05:00Z", data: null },
    { id: "8", type: "signed_copy", version: 1, at: "2026-09-25T12:05:01Z", data: { to: "compras@illimani.bo" } },
  ]);
  assert.deepEqual(entries.map((entry) => entry.label), [
    "Creaste el contrato", "Contrato enviado", "Firmaste (Ana)", "Se envió el código de firma a c***@illimani.bo", "Tu cliente confirmó su correo", "Luis firmó", "Firmado por ambas partes", "Copia firmada enviada a compras@illimani.bo",
  ]);
  const text = whatsAppContractMessage({ customerName: "Café Illimani", storeName: "Estudio Andino", numberLabel: "CON-0001", title: "Contrato de diseño", url: "https://pay.example/d/tok" });
  assert.match(text, /Hola Café Illimani/);
  assert.match(text, /revisar y firmar/);
  assert.match(text, /https:\/\/pay\.example\/d\/tok$/);
});
