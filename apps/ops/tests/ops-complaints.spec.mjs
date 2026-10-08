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

async function openOps(page, { onRequest, settlementBody = settlement(), holds = [], role = "SUPPORT_ADMIN" } = {}) {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_ops_api_origin", "http://localhost:3001");
    sessionStorage.setItem("pagosya_ops_token", "ops_test");
  });
  await page.route("http://localhost:3001/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (onRequest && (await onRequest(route, { path, method, request }))) return;
    if (path === "/internal/ops_users/me") return route.fulfill({ json: { name: "Ana Ops", email: "ana@pagosya.bo", role } });
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
    if (path === "/internal/complaints") return route.fulfill({ json: [] });
    if (path === "/internal/international_payments/availability") return route.fulfill({ json: { available: true } });
    if (path === "/internal/support/merchants/merchant_1") return route.fulfill({ json: dossier });
    if (path === "/internal/merchants/merchant_1/settlement" && method === "GET") return route.fulfill({ json: settlementBody });
    return route.fulfill({ status: 404, json: { message: "no mock for " + path } });
  });
  await page.goto("/");
  await expect(page.locator("#whoami")).toContainText("Ana Ops");
}

const row = (over = {}) => ({ id: "c1", number: "R-2026-000001", status: "RECEIVED", category: "NOT_DELIVERED", buyerName: "Ana", buyerEmail: "ana@example.com", merchant: { id: "m1", name: "Tienda Uno" }, receivedAt: "2026-10-01T15:00:00.000Z", dueAt: "2026-10-08T03:59:59.999Z", assignedTo: null, overdue: true, dueSoon: false, emailFailed: false, test: false, ...over });
const detail = (over = {}) => ({
  ...row(), description: "Nunca llegó mi pedido <b>urgente</b>.", request: "REFUND", buyerPhone: null, referenceGiven: "pi_1", storeNameGiven: null, outcome: null, answer: null, extendedAt: null, extensionReason: null, merchantDueAt: null, assignedOpsUser: null,
  payment: { id: "pi_1", amount: 5000, currency: "BOB", status: "SUCCEEDED", livemode: true, createdAt: "2026-09-30T15:00:00.000Z" },
  merchant: { id: "m1", name: "Tienda Uno", email: "t@example.com", payoutHeldAt: null },
  events: [{ id: "e1", type: "RECEIVED", actor: "BUYER", actorId: null, body: "Nunca llegó mi pedido <b>urgente</b>.", meta: null, createdAt: "2026-10-01T15:00:00.000Z", attachments: [] }],
  sameEmailCount: 1, ...over,
});

test("lists complaints by deadline, opens one, escapes the buyer's text and answers it", async ({ page }) => {
  const calls = [];
  await openOps(page, {
    onRequest: async (route, { path, method, request }) => {
      if (path === "/internal/complaints" && method === "GET") { await route.fulfill({ json: [row(), row({ id: "c2", number: "R-2026-000002", overdue: false, dueSoon: true, dueAt: "2026-10-10T03:59:59.999Z" })] }); return true; }
      if (path === "/internal/complaints/c1" && method === "GET") { await route.fulfill({ json: detail({ status: "IN_REVIEW" }) }); return true; }
      if (path === "/internal/complaints/c1/answer") { calls.push(JSON.parse(request.postData())); await route.fulfill({ json: detail({ status: "ANSWERED", outcome: "UPHELD", answer: "Te devolvimos el dinero completo." }) }); return true; }
      return false;
    },
  });
  await page.goto("/#reclamos");
  const rows = page.locator("#complaintsRows tr");
  await expect(rows.nth(0)).toContainText("R-2026-000001");
  await expect(rows.nth(0)).toHaveClass(/is-overdue/);
  await expect(rows.nth(1)).toHaveClass(/is-due-soon/);
  await rows.nth(0).click();
  await expect(page.locator("#complaintDetail")).toContainText("Nunca llegó mi pedido <b>urgente</b>.");
  await expect(page.locator("#complaintDetail")).toContainText("Otro reclamo del mismo correo");
  await page.selectOption("#complaintOutcome", "UPHELD");
  await page.fill("#complaintAnswer", "Te devolvimos el dinero completo.");
  await page.click("#complaintAnswerSend");
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({ outcome: "UPHELD", answer: "Te devolvimos el dinero completo." });
  await expect(page.locator("#complaintDetail")).toContainText("Respondido");
});

test("an agent does not see extend, answer or refund", async ({ page }) => {
  await openOps(page, {
    role: "SUPPORT_AGENT",
    onRequest: async (route, { path }) => {
      if (path === "/internal/complaints") { await route.fulfill({ json: [row()] }); return true; }
      if (path === "/internal/complaints/c1") { await route.fulfill({ json: detail({ status: "IN_REVIEW" }) }); return true; }
      return false;
    },
  });
  await page.goto("/#reclamos");
  await page.locator("#complaintsRows tr").first().click();
  await expect(page.locator("#complaintAnswerSend")).toHaveCount(0);
  await expect(page.locator("#complaintExtend")).toHaveCount(0);
  await expect(page.locator("#complaintRefund")).toHaveCount(0);
  await expect(page.locator("#complaintAskMerchant")).toBeVisible();
});

test("a refund amount that isn't a number is refused, and a valid one is confirmed with its currency before it is sent", async ({ page }) => {
  const calls = [];
  await openOps(page, {
    onRequest: async (route, { path, request }) => {
      if (path === "/internal/complaints") { await route.fulfill({ json: [row()] }); return true; }
      if (path === "/internal/complaints/c1/refund") { calls.push(JSON.parse(request.postData())); await route.fulfill({ json: detail({ status: "IN_REVIEW" }) }); return true; }
      if (path === "/internal/complaints/c1") { await route.fulfill({ json: detail({ status: "IN_REVIEW", payment: { id: "pi_1", amount: 5000, currency: "USD", status: "SUCCEEDED", livemode: true, createdAt: "2026-09-30T15:00:00.000Z" } }) }); return true; }
      return false;
    },
  });
  await page.goto("/#reclamos");
  await page.locator("#complaintsRows tr").first().click();
  await expect(page.locator("#complaintRefundForm")).toContainText("USD");

  await page.fill("#complaintRefundAmount", "50 Bs");
  await page.click("#complaintRefund");
  await expect(page.locator("#error")).toContainText("Escribe el monto con números");
  expect(calls).toHaveLength(0);

  const dialogs = [];
  page.once("dialog", (dialog) => { dialogs.push(dialog.message()); dialog.accept(); });
  await page.fill("#complaintRefundAmount", "25,50");
  await page.click("#complaintRefund");
  await expect.poll(() => calls.length).toBe(1);
  expect(dialogs[0]).toContain("25,50");
  expect(dialogs[0]).toContain("USD");
  expect(calls[0].amount).toBe(2550);
  expect(calls[0].requestId).toMatch(/^req_[A-Za-z0-9]{8,}$/);
});
