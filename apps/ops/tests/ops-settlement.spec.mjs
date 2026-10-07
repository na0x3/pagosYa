import { expect, test } from "@playwright/test";

const policies = [
  { level: 0, name: "Sin verificar", liveEnabled: false, monthlyLimit: null, perPaymentLimit: null, payoutDelayDays: 7, reserveBps: 1000, reserveDays: 60 },
  { level: 1, name: "Persona", liveEnabled: true, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, payoutDelayDays: 7, reserveBps: 1000, reserveDays: 60 },
  { level: 2, name: "Negocio", liveEnabled: true, monthlyLimit: 10_000_000, perPaymentLimit: 2_000_000, payoutDelayDays: 3, reserveBps: 500, reserveDays: 45 },
  { level: 3, name: "Empresa", liveEnabled: true, monthlyLimit: null, perPaymentLimit: null, payoutDelayDays: 1, reserveBps: 0, reserveDays: 0 },
];
const supportCaseSummary = { id: "case_1", merchant: { id: "merchant_1", name: "Tienda Uno", email: "tienda@example.com" }, category: "PAYMENTS", status: "PENDING", priority: "NORMAL", updatedAt: "2026-10-07T12:00:00.000Z" };
const dossier = {
  merchant: { id: "merchant_1", name: "Tienda Uno", email: "tienda@example.com", status: "ACTIVE", settlementMode: "AGGREGATOR", level: 1, monthlyLimitOverride: null, perPaymentLimitOverride: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", users: [], stores: [], paymentIntents: [], payouts: [], invoices: [], kycSubmissions: [] },
  supportCase: { ...supportCaseSummary, notes: [], summary: "Compradores reclaman entregas." },
};
const settlement = (over = {}) => ({
  merchantId: "merchant_1",
  overrides: { payoutDelayDaysOverride: null, reserveBpsOverride: null, reserveDaysOverride: null },
  hold: null,
  policy: { level: 1, levelName: "Persona", delayDays: 7, reserveBps: 1000, reserveDays: 60 },
  balances: [{ currency: "BOB", available: -1_500, pending: 9_750, reserve: 975 }],
  releases: [{ date: "2026-10-08", currency: "BOB", toAvailable: 8_775, fromReserve: 0 }],
  ...over,
});

async function openOps(page, { onRequest, settlementBody = settlement(), holds = [] } = {}) {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_ops_api_origin", "http://localhost:3001");
    sessionStorage.setItem("pagosya_ops_token", "ops_test");
  });
  await page.route("http://localhost:3001/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (onRequest && (await onRequest(route, { path, method, request }))) return;
    if (path === "/internal/ops_users/me") return route.fulfill({ json: { name: "Ana Ops", email: "ana@pagosya.bo", role: "SUPPORT_ADMIN" } });
    if (path === "/v1/merchants/kyc/pending") return route.fulfill({ json: [] });
    if (path === "/internal/delivery_failures") return route.fulfill({ json: { payouts: { exhausted: [], retrying: [] }, invoices: { exhausted: [], retrying: [] }, webhookEvents: { exhausted: [], retrying: [] } } });
    if (path === "/internal/audit_log") return route.fulfill({ json: [] });
    if (path === "/internal/support/cases") return route.fulfill({ json: [supportCaseSummary] });
    if (path === "/internal/domain_orders") return route.fulfill({ json: [] });
    if (path === "/internal/international_payments") return route.fulfill({ json: [] });
    if (path === "/internal/limits/policies") return route.fulfill({ json: policies });
    if (path === "/internal/limits/settings") return route.fulfill({ json: { usdToBobRate: "6.96" } });
    if (path === "/internal/limits/near_limit") return route.fulfill({ json: [] });
    if (path === "/internal/payout_holds") return route.fulfill({ json: holds });
    if (path === "/internal/support/merchants/merchant_1") return route.fulfill({ json: dossier });
    if (path === "/internal/merchants/merchant_1/settlement" && method === "GET") return route.fulfill({ json: settlementBody });
    return route.fulfill({ status: 404, json: { message: "no mock for " + path } });
  });
  await page.goto("/");
  await expect(page.locator("#whoami")).toContainText("Ana Ops");
}

async function openCase(page) {
  await page.locator('#supportCases button[data-case-id="case_1"]').click();
  await expect(page.locator("#settlementSection h4").first()).toHaveText("Fondos");
}

test("the Fondos card shows balances, the policy and highlights a negative available balance", async ({ page }) => {
  await openOps(page);
  await openCase(page);
  const section = page.locator("#settlementSection");
  await expect(section).toContainText("7 días de demora · reserva 10% por 60 días");
  await expect(section.locator('.settlement-balance[data-currency="BOB"] .negative')).toContainText("Disponible");
  await expect(section).toContainText("En espera");
});

test("placing a hold sends the reason and lifting it calls DELETE", async ({ page }) => {
  const calls = [];
  let held = false;
  await openOps(page, {
    onRequest: async (route, { path, method, request }) => {
      if (path === "/internal/merchants/merchant_1/payout_hold") {
        calls.push({ method, body: request.postData() ? JSON.parse(request.postData()) : null });
        held = method === "POST";
        await route.fulfill({ json: { held } });
        return true;
      }
      if (path === "/internal/merchants/merchant_1/settlement" && method === "GET") {
        await route.fulfill({ json: settlement(held ? { hold: { reason: "Reclamos sin entrega", heldAt: "2026-10-07T12:00:00.000Z", heldBy: "Ana Ops <ana@pagosya.bo>" } } : {}) });
        return true;
      }
      return false;
    },
  });
  await openCase(page);
  await page.fill("#payoutHoldReason", "Reclamos sin entrega");
  await page.locator('[data-settlement-action="place-hold"]').click();
  await expect(page.locator('.settlement-hold[data-state="held"]')).toContainText("Reclamos sin entrega");
  await page.locator('[data-settlement-action="lift-hold"]').click();
  await expect(page.locator('.settlement-hold[data-state="free"]')).toBeVisible();
  expect(calls).toEqual([{ method: "POST", body: { reason: "Reclamos sin entrega" } }, { method: "DELETE", body: null }]);
});

test("overrides save as days and basis points, blank as null", async ({ page }) => {
  let body = null;
  await openOps(page, {
    onRequest: async (route, { path, method, request }) => {
      if (path === "/internal/merchants/merchant_1/settlement" && method === "PATCH") {
        body = JSON.parse(request.postData());
        await route.fulfill({ json: {} });
        return true;
      }
      return false;
    },
  });
  await openCase(page);
  await page.fill("#overrideDelayDays", "2");
  await page.fill("#overrideReservePct", "2.5");
  await page.locator("#settlementOverridesForm button[type=submit]").click();
  await expect.poll(() => body).toEqual({ payoutDelayDaysOverride: 2, reserveBpsOverride: 250, reserveDaysOverride: null });
});

test("a seizure needs a second click to confirm and sends centavos", async ({ page }) => {
  let body = null;
  await openOps(page, {
    onRequest: async (route, { path, method, request }) => {
      if (path === "/internal/merchants/merchant_1/reserve_seizures" && method === "POST") {
        body = JSON.parse(request.postData());
        await route.fulfill({ json: { id: "rs_1" } });
        return true;
      }
      return false;
    },
  });
  await openCase(page);
  await page.fill("#seizureAmount", "5");
  await page.fill("#seizureReason", "Fraude confirmado por el banco");
  await page.fill("#seizureReference", "TRX-991");
  const submit = page.locator("#reserveSeizureForm button[type=submit]");
  await submit.click();
  await expect(submit).toContainText("Confirmar retiro");
  expect(body).toBeNull();
  await submit.click();
  await expect.poll(() => body).toEqual({ amount: 500, currency: "BOB", reason: "Fraude confirmado por el banco", externalReference: "TRX-991" });
});

test("the limits page lists merchants with held payouts", async ({ page }) => {
  await openOps(page, { holds: [{ id: "merchant_1", name: "Tienda Uno", email: "tienda@example.com", payoutHoldReason: "Reclamos sin entrega", payoutHeldAt: "2026-10-07T12:00:00.000Z", payoutHeldByLabel: "Ana Ops <ana@pagosya.bo>" }] });
  await expect(page.locator("#payoutHoldsRows tr")).toContainText("Reclamos sin entrega");
  await expect(page.locator("#payoutHoldsEmpty")).toBeHidden();
});
