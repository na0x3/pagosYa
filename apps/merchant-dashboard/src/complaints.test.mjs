import { test } from "node:test";
import assert from "node:assert/strict";
import { canReply, complaintCategoryLabel, complaintStatusLabel, replyByLabel } from "./complaints.mjs";

test("labels statuses from the merchant's point of view", () => {
  assert.equal(complaintStatusLabel("WAITING_MERCHANT"), "Esperando tu respuesta");
  assert.equal(complaintStatusLabel("IN_REVIEW"), "En revisión por pagosYa");
  assert.equal(complaintStatusLabel("ANSWERED"), "Cerrado");
  assert.equal(complaintCategoryLabel("DUPLICATE_CHARGE"), "Cobro duplicado");
});

test("says when the reply is due, and when it is late", () => {
  const now = new Date("2026-10-12T15:00:00Z");
  assert.equal(replyByLabel("2026-10-13T03:59:59.999Z", now), "Responde hasta hoy");
  assert.equal(replyByLabel("2026-10-14T03:59:59.999Z", now), "Responde hasta el 13/10/2026");
  assert.equal(replyByLabel("2026-10-12T03:59:59.999Z", now), "Fuera de plazo: responde lo antes posible");
});

test("only a complaint waiting on the merchant takes a reply", () => {
  assert.equal(canReply({ status: "WAITING_MERCHANT" }), true);
  assert.equal(canReply({ status: "IN_REVIEW" }), false);
});
