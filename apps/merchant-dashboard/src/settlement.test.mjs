import { test } from "node:test";
import assert from "node:assert/strict";
import { nextLevelSentence, nextPayoutLabel, releaseDateLabel, settlementPolicySentence } from "./settlement.mjs";

test("describes the policy in plain words", () => {
  assert.equal(
    settlementPolicySentence({ level: 1, delayDays: 7, reserveBps: 1000, reserveDays: 60 }),
    "Nivel 1: tus ventas están disponibles a los 7 días; guardamos el 10% por 60 días como reserva de protección.",
  );
  assert.equal(settlementPolicySentence({ level: 3, delayDays: 1, reserveBps: 0, reserveDays: 0 }), "Nivel 3: tus ventas están disponibles al día siguiente.");
  assert.equal(settlementPolicySentence({ level: 2, delayDays: 3, reserveBps: 250, reserveDays: 45 }), "Nivel 2: tus ventas están disponibles a los 3 días; guardamos el 2,5% por 45 días como reserva de protección.");
});

test("tells the merchant what the next level gives them", () => {
  assert.equal(nextLevelSentence({ level: 2, name: "Negocio", delayDays: 3, reserveBps: 500, reserveDays: 45 }), "En el nivel 2 (Negocio) recibes tu dinero a los 3 días y con 5% de reserva.");
  assert.equal(nextLevelSentence({ level: 3, name: "Empresa", delayDays: 1, reserveBps: 0, reserveDays: 0 }), "En el nivel 3 (Empresa) recibes tu dinero al día siguiente y sin reserva.");
  assert.equal(nextLevelSentence(null), "");
});

test("labels the next payout in La Paz time", () => {
  const now = new Date("2026-10-08T13:00:00Z"); // 09:00 La Paz
  assert.equal(nextPayoutLabel("2026-10-08T14:00:00.000Z", now), "Próximo pago: hoy 10:00");
  assert.equal(nextPayoutLabel("2026-10-09T14:00:00.000Z", now), "Próximo pago: 09/10/2026 10:00");
  assert.equal(nextPayoutLabel(null, now), "");
});

test("formats a release day", () => {
  assert.equal(releaseDateLabel("2026-11-30"), "30/11/2026");
});
