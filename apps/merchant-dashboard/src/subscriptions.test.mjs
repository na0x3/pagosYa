import { test } from "node:test";
import assert from "node:assert/strict";
import { CADENCE_LABEL, MEMBER_STATE_TONE, STATUS_LABEL, formatMoney, memberFigures, offersPayload, summaryFigures, subscriberWhatsAppUrl, validateGraceDays, validateOffers } from "./subscriptions.mjs";

test("labels", () => {
  assert.equal(CADENCE_LABEL.BIWEEKLY, "Quincenal");
  assert.equal(STATUS_LABEL.PENDING_PAYMENT, "Pago pendiente");
});

test("money in bolivianos", () => {
  assert.equal(formatMoney(15900, "BOB"), "Bs 159,00");
});

test("summary figures show a dash when there is no pay rate yet", () => {
  const figures = summaryFigures({ active: 3, monthlyRecurring: 45000, currency: "BOB", renewalsThisWeek: 1, renewalPayRate: null, enabled: true });
  assert.deepEqual(figures.map(f => f.value), ["3", "Bs 450,00", "1", "—"]);
  assert.equal(summaryFigures({ active: 0, monthlyRecurring: 0, currency: "BOB", renewalsThisWeek: 0, renewalPayRate: 0.75, enabled: true })[3].value, "75%");
});

test("WhatsApp link needs a usable phone and carries the message", () => {
  assert.equal(subscriberWhatsAppUrl("", "hola"), null);
  assert.equal(subscriberWhatsAppUrl("7000 0000", "hola que tal"), "https://wa.me/59170000000?text=hola%20que%20tal");
});

test("offer form: at least one cadence, integer discount 0–99", () => {
  assert.equal(validateOffers([]), "Elige al menos una frecuencia.");
  assert.equal(validateOffers([{ cadence: "MONTHLY", discountPercent: 100 }]), "El descuento debe ser un número entero entre 0 y 99.");
  assert.equal(validateOffers([{ cadence: "MONTHLY", discountPercent: 10 }]), null);
});

test("offer form turns into an upsert and a removal", () => {
  assert.deepEqual(
    offersPayload([{ cadence: "WEEKLY", checked: true, discountPercent: 5 }, { cadence: "BIWEEKLY", checked: false, discountPercent: 0 }, { cadence: "MONTHLY", checked: false, discountPercent: 10 }], ["MONTHLY"]),
    { upsert: [{ cadence: "WEEKLY", discountPercent: 5 }], remove: ["MONTHLY"] },
  );
});

test("memberFigures shows active members and monthly-equivalent revenue", () => {
  const figures = memberFigures({ members: { active: 32, monthlyRecurring: 184000, currency: "BOB" } });
  assert.deepEqual(figures.map(f => f.label), ["Miembros activos", "Ingreso mensual de membresías"]);
  assert.equal(figures[0].value, "32");
});

test("validateGraceDays accepts whole days from 0 to 30", () => {
  assert.equal(validateGraceDays("7"), null);
  assert.equal(validateGraceDays("0"), null);
  assert.equal(validateGraceDays("31"), "Los días de gracia van de 0 a 30.");
  assert.equal(validateGraceDays("2.5"), "Los días de gracia van de 0 a 30.");
  assert.equal(validateGraceDays(""), "Los días de gracia van de 0 a 30.");
});

test("member states have tones", () => {
  assert.equal(MEMBER_STATE_TONE.GRACE, "warn");
  assert.equal(MEMBER_STATE_TONE.LAPSED, "muted");
});
