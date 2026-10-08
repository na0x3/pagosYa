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

async function openOps(page, { onRequest, settlementBody = settlement(), holds = [], intlRequests = [], intlAvailable = true } = {}) {
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
    if (path === "/internal/limits/policies") return route.fulfill({ json: policies });
    if (path === "/internal/limits/settings") return route.fulfill({ json: { usdToBobRate: "6.96" } });
    if (path === "/internal/limits/near_limit") return route.fulfill({ json: [] });
    if (path === "/internal/payout_holds") return route.fulfill({ json: holds });
    if (path === "/internal/complaints") return route.fulfill({ json: [] });
    if (path === "/internal/international_payments") return route.fulfill({ json: intlRequests });
    if (path === "/internal/international_payments/availability") return route.fulfill({ json: { available: intlAvailable } });
    if (path === "/internal/support/merchants/merchant_1") return route.fulfill({ json: dossier });
    if (path === "/internal/merchants/merchant_1/settlement" && method === "GET") return route.fulfill({ json: settlementBody });
    return route.fulfill({ status: 404, json: { message: "no mock for " + path } });
  });
  await page.goto("/");
  await expect(page.locator("#whoami")).toContainText("Ana Ops");
}


const intlRequest = { id: "merchant_9", name: "Tienda Nueve", email: "nueve@example.com", settlementMode: "AGGREGATOR", internationalPaymentsStatus: "REQUESTED", updatedAt: "2026-10-07T12:00:00.000Z" };

test("while international payments are switched off, ops see a notice and can only reject a request", async ({ page }) => {
  await openOps(page, { intlRequests: [intlRequest], intlAvailable: false });
  const section = page.locator("#pagos-internacionales");
  await expect(page.locator("#intlOffNotice")).toBeVisible();
  await expect(page.locator("#intlOffNotice")).toContainText("Los pagos internacionales están desactivados");
  await section.locator('[data-intl-merchant="merchant_9"]').click();
  await expect(section.getByRole("button", { name: "Aprobar" })).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Rechazar" })).toBeVisible();
});

test("while switched on, a request can still be approved", async ({ page }) => {
  await openOps(page, { intlRequests: [intlRequest], intlAvailable: true });
  const section = page.locator("#pagos-internacionales");
  await section.locator('[data-intl-merchant="merchant_9"]').click();
  await expect(section.getByRole("button", { name: "Aprobar" })).toBeVisible();
  await expect(page.locator("#intlOffNotice")).toBeHidden();
});
