import assert from "node:assert/strict";
import test from "node:test";
import { greetingFor, kycStatusLabel, overviewKpis, renderOverviewKpis, renderSetupSteps, setupSteps } from "./overview.mjs";

const money = (cents, currency = "BOB") => `${(cents / 100).toFixed(2)} ${currency}`;

test("the greeting follows the hour in Bolivia, not the browser's clock", () => {
  // 12:30 UTC is 08:30 in La Paz (UTC-4).
  assert.equal(greetingFor(new Date("2026-09-27T12:30:00Z"), "Ana"), "Buenos días, Ana");
  assert.equal(greetingFor(new Date("2026-09-27T19:00:00Z"), "Ana"), "Buenas tardes, Ana");
  // 02:00 UTC on the 28th is 22:00 on the 27th in La Paz.
  assert.equal(greetingFor(new Date("2026-09-28T02:00:00Z"), ""), "Buenas noches");
});

test("KYC states read in Spanish, and an unknown one is shown as it came", () => {
  assert.equal(kycStatusLabel("APPROVED"), "Aprobado");
  assert.equal(kycStatusLabel("PENDING_REVIEW"), "En revisión");
  assert.equal(kycStatusLabel("REJECTED"), "Rechazado");
  assert.equal(kycStatusLabel("NOT_SUBMITTED"), "Pendiente de envío");
  assert.equal(kycStatusLabel("SOMETHING_NEW"), "SOMETHING_NEW");
});

test("the key figures come straight from the finance response", () => {
  const kpis = overviewKpis({
    finances: { totalRevenue: 90_000, paymentCount: 3, totalStoreViews: 41, monthlyProjection: { monthToDateRevenue: 30_000 } },
    money,
  });
  assert.deepEqual(kpis.map((kpi) => [kpi.label, kpi.value]), [
    ["Ventas este mes", "300.00 BOB"],
    ["Ventas totales", "900.00 BOB"],
    ["Pagos exitosos", "3"],
    ["Visitas a la tienda", "41"],
  ]);
});

test("missing finance fields show zero, never a made-up figure", () => {
  const kpis = overviewKpis({ finances: {}, money });
  assert.deepEqual(kpis.map((kpi) => kpi.value), ["0.00 BOB", "0.00 BOB", "0", "0"]);
});

test("the setup checklist marks what is really done and links to where the rest happens", () => {
  const steps = setupSteps({ kycStatus: "APPROVED", invoicingConfigured: false, storePublished: true, paymentCount: 0, paymentStore: true });
  assert.deepEqual(steps.map((step) => [step.id, step.done]), [["kyc", true], ["invoicing", false], ["publish", true], ["first-payment", false]]);
  assert.ok(steps.every((step) => step.view && step.label));
});

test("a store that does not take payments skips the KYC and invoicing steps", () => {
  const steps = setupSteps({ kycStatus: "REJECTED", invoicingConfigured: false, storePublished: false, paymentCount: 0, paymentStore: false });
  assert.deepEqual(steps.map((step) => step.id), ["publish", "first-payment"]);
});

test("rendered markup escapes values and exposes progress to assistive technology", () => {
  const html = renderOverviewKpis([{ label: "Ventas <b>", value: "1 & 2", hint: "" }]);
  assert.match(html, /Ventas &lt;b&gt;/);
  assert.match(html, /1 &amp; 2/);
  const steps = renderSetupSteps(setupSteps({ kycStatus: "APPROVED", invoicingConfigured: true, storePublished: false, paymentCount: 0, paymentStore: true }));
  assert.match(steps, /2 de 4/);
  assert.match(steps, /role="progressbar"/);
  assert.match(steps, /aria-valuenow="50"/);
});

test("once every step is done the checklist renders nothing", () => {
  const done = setupSteps({ kycStatus: "APPROVED", invoicingConfigured: true, storePublished: true, paymentCount: 1, paymentStore: true });
  assert.equal(renderSetupSteps(done), "");
});
