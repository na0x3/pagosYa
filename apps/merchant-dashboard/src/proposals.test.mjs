import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXAMPLE_PROMPTS,
  PROPOSAL_STATE_LABEL,
  blankProposalBlocks,
  editorItems,
  pendingData,
  pendingSummary,
  proposalItemsPayload,
  proposalPayload,
  proposalState,
  proposalTimeline,
  proposalTotal,
  validityLine,
  whatsAppProposalMessage,
} from "./proposals.mjs";

const NOW = new Date("2026-09-25T15:00:00.000Z");

test("the status chips of the list", () => {
  const future = "2026-10-04T03:59:59.000Z";
  const past = "2026-09-20T03:59:59.000Z";
  assert.equal(proposalState({ status: "DRAFT", validUntil: future }, NOW), "draft");
  assert.equal(proposalState({ status: "SENT", validUntil: future }, NOW), "sent");
  assert.equal(proposalState({ status: "VIEWED", validUntil: future }, NOW), "viewed");
  assert.equal(proposalState({ status: "CHANGES_REQUESTED", validUntil: future }, NOW), "changes");
  assert.equal(proposalState({ status: "ACCEPTED", validUntil: past }, NOW), "accepted");
  // Past its validity it reads expired at once, like the server's tabs.
  assert.equal(proposalState({ status: "VIEWED", validUntil: past }, NOW), "expired");
  assert.equal(proposalState({ status: "EXPIRED", validUntil: past }, NOW), "expired");
  assert.equal(proposalState({ status: "VOIDED", validUntil: future }, NOW), "voided");
  assert.deepEqual(Object.keys(PROPOSAL_STATE_LABEL).sort(), ["accepted", "changes", "draft", "expired", "sent", "viewed", "voided"]);
  assert.equal(PROPOSAL_STATE_LABEL.changes, "Cambios pedidos");
});

test("an unknown price is an empty price field in the editor, and a {{precio}} marker on the server", () => {
  const items = editorItems([
    { description: "Diseño de logo", quantity: 1, unitAmount: 150000, paymentLinkId: "pl_logo" },
    { description: "Fotografía {{precio}}", quantity: 2, unitAmount: 0, paymentLinkId: null },
  ]);
  assert.deepEqual(items.map(({ description, priceText, unitAmount, needsPrice }) => ({ description, priceText, unitAmount, needsPrice })), [
    { description: "Diseño de logo", priceText: "1.500,00", unitAmount: 150000, needsPrice: false },
    { description: "Fotografía", priceText: "", unitAmount: null, needsPrice: true },
  ]);
  assert.deepEqual(proposalItemsPayload(items), [
    { description: "Diseño de logo", quantity: 1, unitAmount: 150000, paymentLinkId: "pl_logo" },
    { description: "Fotografía {{precio}}", quantity: 2, unitAmount: 0 },
  ]);
  // Typing a price removes the marker.
  items[1].unitAmount = 20000;
  assert.deepEqual(proposalItemsPayload(items)[1], { description: "Fotografía", quantity: 2, unitAmount: 20000 });
  assert.equal(proposalTotal(items), 190000);
  // A blank line is dropped.
  assert.equal(proposalItemsPayload([...items, { description: "  ", quantity: 1, unitAmount: null, priceText: "" }]).length, 2);
});

test("a price YAPI took from the merchant's words is flagged until the merchant confirms it", () => {
  const items = editorItems([{ description: "Letrero {{confirmar precio}}", quantity: 1, unitAmount: 80000, paymentLinkId: null }]);
  assert.deepEqual(items.map(({ description, unitAmount, needsPrice, needsConfirm }) => ({ description, unitAmount, needsPrice, needsConfirm })), [
    { description: "Letrero", unitAmount: 80000, needsPrice: false, needsConfirm: true },
  ]);
  // Unconfirmed, the server keeps the marker (it blocks the send) and the pending list asks for it.
  assert.deepEqual(proposalItemsPayload(items), [{ description: "Letrero {{confirmar precio}}", quantity: 1, unitAmount: 80000 }]);
  const draft = { title: "Letrero", customer: { name: "Ana" }, items, blocks: [] };
  assert.deepEqual(pendingData(draft), [{ where: "item:0", label: "Confirma el precio de «Letrero»", token: "{{confirmar precio}}" }]);
  // One tap confirms it.
  items[0].needsConfirm = false;
  assert.deepEqual(proposalItemsPayload(items), [{ description: "Letrero", quantity: 1, unitAmount: 80000 }]);
  assert.deepEqual(pendingData(draft), []);
});

test("lists every pending {{dato}} with where it is, so the merchant can fix it before sending", () => {
  const pending = pendingData({
    title: "Propuesta para {{cliente}}",
    customer: { name: "", email: "" },
    items: [{ description: "Fotografía", unitAmount: null, needsPrice: true }, { description: "Logo", unitAmount: 100 }],
    blocks: [{ type: "paragraph", title: "Cronograma", text: "Empezamos el {{fecha de inicio}}." }, { type: "list", title: "Alcance", items: ["Uno", "{{detalle}}"] }],
  });
  assert.deepEqual(pending, [
    { where: "title", label: "Título", token: "{{cliente}}" },
    { where: "item:0", label: "Precio de «Fotografía»", token: "{{precio}}" },
    { where: "block:0", label: "Cronograma", token: "{{fecha de inicio}}" },
    { where: "block:1", label: "Alcance", token: "{{detalle}}" },
  ]);
  // A {{precio}} inside a text is an amount YAPI took out: the merchant writes it or deletes it.
  const removed = pendingData({ title: "T", customer: {}, items: [], blocks: [{ type: "paragraph", title: "Inversión", text: "Son {{precio}} en total." }] });
  assert.deepEqual(removed, [{ where: "block:0", label: "Inversión: YAPI quitó un monto — escríbelo o bórralo", token: "{{precio}}" }]);
  assert.equal(pendingSummary(removed), "Falta 1 dato");
  assert.equal(pendingSummary(pending), "Faltan 4 datos");
});

test("validity line", () => {
  assert.equal(validityLine({ status: "SENT", validUntil: "2026-10-04T03:59:59.000Z" }, NOW), "Válida hasta el 3 oct · quedan 8 días");
  assert.equal(validityLine({ status: "SENT", validUntil: "2026-09-26T03:59:59.000Z" }, NOW), "Vence hoy");
  assert.equal(validityLine({ status: "EXPIRED", validUntil: "2026-09-20T03:59:59.000Z" }, NOW), "Venció el 19 sept");
  assert.equal(validityLine({ status: "ACCEPTED", validUntil: "2026-09-20T03:59:59.000Z" }, NOW), "");
});

test("the save payload carries every editable field; blank contact fields are null", () => {
  const payload = proposalPayload({
    title: " Identidad ",
    customer: { name: "Café Aroma", email: "", phone: " 7000 0000 " },
    items: editorItems([{ description: "Logo", quantity: 1, unitAmount: 1000 }]),
    blocks: [{ type: "paragraph", title: "Introducción", text: "Hola" }, { type: "list", title: "Alcance", items: ["a", " ", "b"] }],
    validUntil: "2026-10-10T03:59:59.000Z",
  });
  assert.deepEqual(payload, {
    title: "Identidad",
    customerName: "Café Aroma",
    customerEmail: null,
    customerPhone: "7000 0000",
    items: [{ description: "Logo", quantity: 1, unitAmount: 1000 }],
    content: [{ type: "paragraph", title: "Introducción", text: "Hola" }, { type: "list", title: "Alcance", items: ["a", "b"] }],
    validUntil: "2026-10-10T03:59:59.000Z",
  });
  // A sent proposal's validity is what the customer's link obeys: autosave leaves it out until the new version is sent.
  const draft = { title: "T", customer: {}, items: [], blocks: [], validUntil: "2026-10-10T03:59:59.000Z" };
  assert.equal("validUntil" in proposalPayload(draft, { validity: false }), false);
  assert.equal(proposalPayload(draft).validUntil, "2026-10-10T03:59:59.000Z");
});

test("the blank template has the nine sections of an AI draft", () => {
  assert.deepEqual(blankProposalBlocks().map((block) => block.title), [
    "Introducción", "Entendimiento del problema", "Alcance", "Entregables", "Cronograma", "Inversión", "Condiciones de pago", "Revisiones", "Próximo paso",
  ]);
  assert.equal(EXAMPLE_PROMPTS.length, 3);
  assert.ok(EXAMPLE_PROMPTS.some((prompt) => /cafetería/.test(prompt.brief)));
});

test("timeline copy", () => {
  const entries = proposalTimeline([
    { id: "1", type: "created", at: "2026-09-20T10:00:00Z" },
    { id: "2", type: "ai_drafted", at: "2026-09-20T10:00:01Z", data: { tone: "cercano" } },
    { id: "3", type: "sent", version: 1, at: "2026-09-20T11:00:00Z" },
    { id: "4", type: "viewed", version: 1, at: "2026-09-21T10:00:00Z" },
    { id: "5", type: "changes_requested", at: "2026-09-21T11:00:00Z", data: { name: "Ana", message: "Otro color" } },
    { id: "6", type: "sent", version: 2, at: "2026-09-22T11:00:00Z" },
    { id: "7", type: "accepted", at: "2026-09-23T11:00:00Z", data: { name: "Ana Quispe" } },
    { id: "8", type: "cobro_created", at: "2026-09-23T12:00:00Z", data: { cobroId: "c1" } },
    { id: "9", type: "merchant_notified", at: "2026-09-23T12:00:01Z" },
  ]);
  assert.deepEqual(entries.map((entry) => entry.label), [
    "Creaste la propuesta",
    "YAPI armó el borrador",
    "Propuesta enviada",
    "Tu cliente la abrió",
    "Ana pidió cambios: «Otro color»",
    "Enviaste la versión 2",
    "Aceptada por Ana Quispe",
    "Creaste el cobro",
  ]);
  assert.equal(entries[6].tone, "good");
});

test("WhatsApp message", () => {
  const text = whatsAppProposalMessage({ customerName: "Café Aroma", storeName: "Estudio Illimani", numberLabel: "PRO-0003", title: "Identidad visual", total: 280000, currency: "BOB", validUntil: "2026-10-04T03:59:59.000Z", url: "https://pay.example/d/tok" });
  assert.equal(text, "Hola Café, te comparto la propuesta PRO-0003 de Estudio Illimani: «Identidad visual» por Bs 2.800,00 (válida hasta el 3 oct). Puedes verla y aceptarla aquí: https://pay.example/d/tok");
});
