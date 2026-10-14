import { test } from "node:test";
import assert from "node:assert/strict";
import { conversationTags, notesLeft, shortDate, teachPreview, usageLabel } from "./assistant.mjs";

test("usage reads as conversations of the month", () => {
  assert.equal(usageLabel(142, 300), "142 de 300 conversaciones este mes");
  assert.equal(usageLabel(300, 300), "300 de 300 conversaciones este mes · el chat volvió al botón de contacto");
});

test("conversation tags", () => {
  assert.deepEqual(conversationTags({ addedToCart: true, handedOff: false, buyerMessages: 3 }), ["3 mensajes", "Agregó al carrito"]);
  assert.deepEqual(conversationTags({ addedToCart: false, handedOff: true, buyerMessages: 1 }), ["1 mensaje", "Pasó con la tienda"]);
});

test("teaching shows a question and answer", () => {
  assert.equal(teachPreview("dan factura", " Sí, con NIT. "), "Pregunta: dan factura\nRespuesta: Sí, con NIT.");
});

test("notes left", () => {
  assert.equal(notesLeft("abc"), 3997);
  assert.equal(notesLeft("x".repeat(4001)), -1);
});

test("short dates", () => {
  const now = new Date("2026-10-13T15:00:00Z");
  assert.equal(shortDate("2026-10-13T14:00:00Z", now), "hoy");
  assert.equal(shortDate("2026-10-12T14:00:00Z", now), "ayer");
  assert.equal(shortDate("2026-10-01T14:00:00Z", now), "1 oct");
});
