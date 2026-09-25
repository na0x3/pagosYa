import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCobroPayload,
  cobroState,
  cobroTitle,
  cobroTotal,
  dueDateFromInput,
  dueDateFromPreset,
  dueLine,
  formatMoney,
  lineProblem,
  parseMoney,
  paymentBadge,
  timelineEntries,
  validateCobroDraft,
  whatsAppMessage,
  whatsAppShareUrl,
} from "./cobros.mjs";

// 10:00 in La Paz (UTC-4) on 25 Sep 2026.
const NOW = new Date("2026-09-25T14:00:00Z");

test("money typed the Bolivian way, the US way or bare becomes centavos", () => {
  assert.equal(parseMoney("150"), 15000);
  assert.equal(parseMoney("150,5"), 15050);
  assert.equal(parseMoney("150.50"), 15050);
  assert.equal(parseMoney("1.250,00"), 125000);
  assert.equal(parseMoney("1,250.00"), 125000);
  assert.equal(parseMoney("1.250"), 125000);
  assert.equal(parseMoney("Bs 45,90"), 4590);
  assert.equal(parseMoney("0"), 0);
  for (const bad of ["", "abc", "  ", "-5", "1,2,3,4.5.6"]) assert.equal(parseMoney(bad), null, bad);
});

test("money is shown as Bs with Bolivian separators", () => {
  assert.equal(formatMoney(125000), "Bs 1.250,00");
  assert.equal(formatMoney(4590, "BOB"), "Bs 45,90");
  assert.equal(formatMoney(1000, "USD"), "US$ 10,00");
});

test("a due preset ends that day in Bolivia", () => {
  assert.equal(dueDateFromPreset(0, NOW), "2026-09-26T03:59:59.000Z");
  assert.equal(dueDateFromPreset(7, NOW), "2026-10-03T03:59:59.000Z");
  assert.equal(dueDateFromPreset(30, NOW), "2026-10-26T03:59:59.000Z");
  // 23:30 in La Paz is still "today" there, although it is tomorrow in UTC.
  assert.equal(dueDateFromPreset(0, new Date("2026-09-26T03:30:00Z")), "2026-09-26T03:59:59.000Z");
  assert.equal(dueDateFromInput("2026-10-02"), "2026-10-03T03:59:59.000Z");
  assert.equal(dueDateFromInput("not a date"), null);
});

const doc = (overrides = {}) => ({ id: "c1", status: "SENT", totalAmount: 10000, currency: "BOB", dueAt: "2026-10-03T03:59:59.000Z", paidAt: null, ...overrides });

test("the state a merchant cares about", () => {
  assert.equal(cobroState(doc({ status: "DRAFT" }), NOW), "draft");
  assert.equal(cobroState(doc(), NOW), "open");
  assert.equal(cobroState(doc({ status: "VIEWED" }), NOW), "open");
  assert.equal(cobroState(doc({ status: "OVERDUE" }), NOW), "overdue");
  // The worker runs every 15 minutes; the list does not wait for it.
  assert.equal(cobroState(doc({ dueAt: "2026-09-24T03:59:59.000Z" }), NOW), "overdue");
  assert.equal(cobroState(doc({ status: "PAID" }), NOW), "paid");
  assert.equal(cobroState(doc({ status: "VOIDED" }), NOW), "voided");
});

test("a paid cobro says when it was a test payment or needs a refund", () => {
  assert.equal(paymentBadge(doc({ status: "PAID", payment: { testMode: true } })).label, "Pago de prueba");
  assert.deepEqual(paymentBadge(doc({ status: "VOIDED", payment: { afterClose: true } })), { label: "Pago recibido tras anular — reembolsar", tone: "warning" });
  assert.equal(paymentBadge(doc({ status: "PAID", payment: { afterClose: true } })).label, "Pago repetido — reembolsar");
  assert.equal(paymentBadge(doc({ status: "VIEWED", payment: { mismatch: true } })).label, "Pago de otra versión — revisar");
  assert.equal(paymentBadge(doc({ status: "PAID", payment: { manual: true } })), null);
  assert.equal(paymentBadge(doc()), null);
});

test("the due line reads like a person", () => {
  assert.equal(dueLine(doc({ dueAt: "2026-09-26T03:59:59.000Z" }), NOW), "Vence hoy");
  assert.equal(dueLine(doc({ dueAt: "2026-09-27T03:59:59.000Z" }), NOW), "Vence mañana");
  assert.equal(dueLine(doc(), NOW), "Vence en 7 días");
  assert.equal(dueLine(doc({ dueAt: "2026-09-25T03:59:59.000Z" }), NOW), "Venció ayer");
  assert.equal(dueLine(doc({ status: "OVERDUE", dueAt: "2026-09-24T03:59:59.000Z" }), NOW), "Venció hace 2 días");
  assert.equal(dueLine(doc({ status: "PAID", paidAt: "2026-09-24T15:00:00Z" }), NOW), "Pagado el 24 sept");
  assert.equal(dueLine(doc({ status: "DRAFT" }), NOW), "Borrador sin enviar");
  assert.equal(dueLine(doc({ status: "VOIDED" }), NOW), "Anulado");
  assert.equal(dueLine(doc({ dueAt: null }), NOW), "Sin fecha de vencimiento");
});

test("the WhatsApp message and link", () => {
  const text = whatsAppMessage({ customerName: "Ana Quispe", storeName: "Estudio Illimani", numberLabel: "COB-0007", total: 240000, currency: "BOB", dueAt: "2026-10-03T03:59:59.000Z", url: "https://pay.example/d/tok" });
  assert.equal(text, "Hola Ana, te comparto el cobro COB-0007 de Estudio Illimani por Bs 2.400,00 (vence el 2 oct). Puedes verlo y pagarlo con QR o tarjeta aquí: https://pay.example/d/tok");
  const reminder = whatsAppMessage({ customerName: null, storeName: "Estudio", numberLabel: "COB-0007", total: 1000, currency: "BOB", dueAt: null, url: "https://x/d/t", reminder: true });
  assert.equal(reminder, "Hola, te recuerdo el cobro COB-0007 de Estudio por Bs 10,00. Puedes verlo y pagarlo con QR o tarjeta aquí: https://x/d/t");
  // An 8-digit Bolivian mobile gets the country code; any other number keeps its digits.
  assert.equal(whatsAppShareUrl("7000-0000", "hola"), "https://wa.me/59170000000?text=hola");
  assert.equal(whatsAppShareUrl("+591 7000 0000", "a b"), "https://wa.me/59170000000?text=a%20b");
  assert.equal(whatsAppShareUrl("", "hola"), "https://wa.me/?text=hola");
});

test("the timeline speaks Spanish and flags a payment after closing", () => {
  const entries = timelineEntries([
    { id: "1", type: "created", at: "2026-09-25T14:00:00Z" },
    { id: "2", type: "sent", at: "2026-09-25T14:01:00Z", version: 1 },
    { id: "3", type: "shared", at: "2026-09-25T14:02:00Z", data: { channel: "whatsapp" } },
    { id: "4", type: "emailed", at: "2026-09-25T14:03:00Z", data: { to: "ana@example.com" } },
    { id: "5", type: "viewed", at: "2026-09-25T15:00:00Z" },
    { id: "6", type: "reminded", at: "2026-09-26T13:00:00Z", data: { channel: "email", automatic: true, stage: "due" } },
    { id: "7", type: "checkout_started", at: "2026-09-26T15:00:00Z" },
    { id: "8", type: "paid", at: "2026-09-26T15:02:00Z", data: { livemode: false } },
    { id: "9", type: "payment_after_close", at: "2026-09-27T15:02:00Z", data: {} },
    { id: "10", type: "something_new", at: "2026-09-27T16:00:00Z" },
  ]);
  assert.deepEqual(entries.map((entry) => entry.label), [
    "Creaste el cobro",
    "Cobro listo para compartir",
    "Compartido por WhatsApp",
    "Correo enviado a ana@example.com",
    "Tu cliente lo abrió",
    "Recordatorio automático por correo (día de vencimiento)",
    "Tu cliente empezó a pagar",
    "Pagado · pago de prueba",
    "Llegó un pago con el cobro ya cerrado (anulado o ya pagado): reembólsalo",
  ]);
  assert.equal(entries[8].tone, "warning");
  assert.equal(entries[7].tone, "good");
});

test("a draft becomes the API payload, with a title from its items", () => {
  assert.equal(cobroTitle([{ description: "Diseño de logo" }]), "Diseño de logo");
  assert.equal(cobroTitle([{ description: "Diseño de logo" }, { description: "Tarjetas" }, { description: "Envío" }]), "Diseño de logo y 2 más");
  assert.equal(cobroTitle([]), "Cobro");
  const payload = buildCobroPayload({
    customer: { name: " Ana Quispe ", email: "ANA@example.com", phone: "70000000", businessCustomerId: "cust_1" },
    items: [{ description: "Diseño", quantity: 2, unitAmount: 15000, paymentLinkId: "pl_1" }, { description: "  ", quantity: 1, unitAmount: 0 }],
    dueAt: "2026-10-03T03:59:59.000Z",
    note: "Gracias",
    autoReminders: true,
  });
  assert.deepEqual(payload, {
    kind: "INVOICE",
    title: "Diseño",
    businessCustomerId: "cust_1",
    customerName: "Ana Quispe",
    customerEmail: "ana@example.com",
    customerPhone: "70000000",
    customerDocument: null,
    items: [{ description: "Diseño", quantity: 2, unitAmount: 15000, paymentLinkId: "pl_1" }],
    dueAt: "2026-10-03T03:59:59.000Z",
    autoReminders: true,
    content: [{ type: "paragraph", text: "Gracias" }],
  });
});

test("contact fields are always sent: a cleared one as null, so it never falls back to the CRM row", () => {
  const payload = buildCobroPayload({ customer: { name: "Beto", email: "  ", phone: "", document: " 4567890 ", businessCustomerId: "cust_1" }, items: [{ description: "x", quantity: 1, unitAmount: 100 }], dueAt: null });
  assert.equal(payload.customerEmail, null);
  assert.equal(payload.customerPhone, null);
  assert.equal(payload.customerDocument, "4567890");
  assert.equal(payload.businessCustomerId, "cust_1");
  assert.equal("dueAt" in payload, false);
});

test("a line needs both a description and a price, and the total counts exactly the lines the payload sends", () => {
  assert.equal(lineProblem({ description: "", quantity: 1, unitAmount: null, priceText: "" }), null);
  assert.equal(lineProblem({ description: "Envío", quantity: 1, unitAmount: null, priceText: "" }), "Falta el precio de esta línea.");
  assert.equal(lineProblem({ description: "Envío", quantity: 1, unitAmount: null, priceText: "abc" }), "Revisa el precio: escribe solo el número, por ejemplo 150,50.");
  assert.equal(lineProblem({ description: "  ", quantity: 1, unitAmount: 2550, priceText: "25,50" }), "Falta la descripción de esta línea.");
  assert.equal(lineProblem({ description: "Envío", quantity: 2, unitAmount: 2550, priceText: "25,50" }), null);
  const items = [
    { description: "Diseño", quantity: 2, unitAmount: 15000 },
    { description: "", quantity: 1, unitAmount: 9900 }, // a price without description is not charged
    { description: "Envío", quantity: 1, unitAmount: null },
    { description: "Tarjetas", quantity: 1.4, unitAmount: 1000 },
  ];
  const payload = buildCobroPayload({ customer: { name: "Ana" }, items, dueAt: null });
  assert.equal(cobroTotal(items), payload.items.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0));
  assert.equal(cobroTotal(items), 31000);
});

test("the draft says what is missing, in plain words", () => {
  assert.deepEqual(validateCobroDraft({ customer: { name: "" }, items: [], dueAt: null }), [
    "¿A quién le cobras? Escribe su nombre.",
    "Agrega al menos un producto o servicio con precio.",
  ]);
  assert.deepEqual(validateCobroDraft({ customer: { name: "Ana", email: "ana@" }, items: [{ description: "x", quantity: 1, unitAmount: 100 }] }), ["Revisa el correo del cliente."]);
  assert.deepEqual(validateCobroDraft({ customer: { name: "Ana" }, items: [{ description: "x", quantity: 1, unitAmount: 100 }] }), []);
  // A half-filled line is never silently dropped.
  assert.deepEqual(validateCobroDraft({ customer: { name: "Ana" }, items: [{ description: "x", quantity: 1, unitAmount: 100 }, { description: "", quantity: 1, unitAmount: 500, priceText: "5" }] }), ["Revisa las líneas marcadas: cada una necesita descripción y precio."]);
});

test("a due date in the past is refused", () => {
  const ok = { customer: { name: "Ana" }, items: [{ description: "x", quantity: 1, unitAmount: 100 }] };
  assert.deepEqual(validateCobroDraft({ ...ok, dueAt: dueDateFromInput("2026-09-24") }, NOW), ["La fecha de vencimiento ya pasó. Elige hoy o una fecha futura."]);
  assert.deepEqual(validateCobroDraft({ ...ok, dueAt: dueDateFromInput("2026-09-25") }, NOW), []);
});

test("the timeline names a payment by hand, a mismatch and the reminders switch", () => {
  const labels = timelineEntries([
    { id: "1", type: "paid_manually", at: "2026-09-26T15:00:00Z", data: { method: "transfer", reference: "BNB 123" } },
    { id: "2", type: "payment_mismatch", at: "2026-09-26T15:00:00Z", data: {} },
    { id: "3", type: "reminders_off", at: "2026-09-26T15:00:00Z" },
    { id: "4", type: "reminders_on", at: "2026-09-26T15:00:00Z" },
    { id: "5", type: "paid_manually", at: "2026-09-26T15:00:00Z", data: { method: "cash" } },
  ]).map((entry) => entry.label);
  assert.deepEqual(labels, [
    "Marcado como pagado · transferencia · BNB 123",
    "Llegó un pago por otra versión o monto del cobro: revísalo y reembolsa si corresponde",
    "Recordatorios automáticos apagados",
    "Recordatorios automáticos encendidos",
    "Marcado como pagado · efectivo",
  ]);
});
