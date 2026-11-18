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

async function openOps(page, { onRequest, settlementBody = settlement(), holds = [], role = "SUPPORT_ADMIN", accounts = [] } = {}) {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_ops_api_origin", "http://localhost:3001");
    sessionStorage.setItem("pagosya_ops_session", "opss_test");
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
    if (path === "/internal/payout_accounts") return route.fulfill({ json: accounts });
    if (path === "/internal/international_payments/availability") return route.fulfill({ json: { available: true } });
    if (path === "/internal/support/merchants/merchant_1") return route.fulfill({ json: dossier });
    if (path === "/internal/merchants/merchant_1/settlement" && method === "GET") return route.fulfill({ json: settlementBody });
    return route.fulfill({ status: 404, json: { message: "no mock for " + path } });
  });
  await page.goto("/");
  await expect(page.locator("#whoami")).toContainText("Ana Ops");
}


const account = (over = {}) => ({
  id: "pa_1", merchantId: "m_1", currency: "BOB", bankCode: "BNB", bankName: "Banco Nacional de Bolivia", accountNumber: "4012345678", holderName: "Ana Pérez",
  proofFileName: "cert.pdf", proofContentType: "application/pdf", status: "PENDING_REVIEW", isChange: false, createdAt: "2026-10-08T15:00:00.000Z",
  merchant: { id: "m_1", name: "Tienda Uno", email: "t@example.com", level: 0 }, expected: { level: 1, legalName: "Ana Pérez", legalRepName: "Ana Pérez" }, kycPending: true, ...over,
});

test("a first account shows the expected name and can only be approved with the three ticks", async ({ page }) => {
  const calls = [];
  await openOps(page, {
    accounts: [account()],
    onRequest: async (route, { path, request }) => {
      if (path === "/internal/payout_accounts/pa_1/approve") { calls.push(JSON.parse(request.postData())); await route.fulfill({ json: { ...account(), status: "APPROVED" } }); return true; }
      return false;
    },
  });
  await page.goto("/#cuentas");
  const section = page.locator("#cuentas");
  await expect(section).toContainText("Primera cuenta");
  await expect(section).toContainText("Nombre esperado: Ana Pérez");
  await expect(section).toContainText("Banco Nacional de Bolivia · 4012345678 · Ana Pérez");
  const approve = section.getByRole("button", { name: "Aprobar cuenta" });
  await expect(approve).toBeDisabled();
  for (const label of ["El nombre coincide", "El número coincide", "El banco coincide"]) await section.getByLabel(label).check();
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({ checks: { nameMatches: true, numberMatches: true, bankMatches: true }, ownerType: "PERSON" });
});

test("a company account asks for the owner type, and a sole proprietorship needs a reason", async ({ page }) => {
  const calls = [];
  await openOps(page, {
    accounts: [account({ expected: { level: 2, legalName: "Tienda Uno SRL", legalRepName: "Ana Pérez" } })],
    onRequest: async (route, { path, request }) => {
      if (path === "/internal/payout_accounts/pa_1/approve") { calls.push(JSON.parse(request.postData())); await route.fulfill({ json: account({ status: "APPROVED" }) }); return true; }
      return false;
    },
  });
  await page.goto("/#cuentas");
  const section = page.locator("#cuentas");
  await expect(section).toContainText("Nombre esperado: Tienda Uno SRL (o Ana Pérez si es unipersonal)");
  for (const label of ["El nombre coincide", "El número coincide", "El banco coincide"]) await section.getByLabel(label).check();
  await section.getByLabel("A nombre de", { exact: true }).selectOption("SOLE_PROPRIETOR");
  const approve = section.getByRole("button", { name: "Aprobar cuenta" });
  await expect(approve).toBeDisabled();
  await section.getByLabel("Por qué está a nombre del dueño").fill("Empresa unipersonal; el dueño es el representante legal");
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({ checks: { nameMatches: true, numberMatches: true, bankMatches: true }, ownerType: "SOLE_PROPRIETOR", reason: "Empresa unipersonal; el dueño es el representante legal" });
});

test("an agent cannot approve a change but can reject it with a reason", async ({ page }) => {
  const calls = [];
  await openOps(page, {
    role: "SUPPORT_AGENT",
    accounts: [account({ isChange: true, kycPending: false })],
    onRequest: async (route, { path, request }) => {
      if (path === "/internal/payout_accounts/pa_1/reject") { calls.push(JSON.parse(request.postData())); await route.fulfill({ json: account({ status: "REJECTED" }) }); return true; }
      return false;
    },
  });
  await page.goto("/#cuentas");
  const section = page.locator("#cuentas");
  await expect(section).toContainText("Cambio de cuenta");
  await expect(section).toContainText("Solo un administrador puede aprobar un cambio de cuenta.");
  await expect(section.getByRole("button", { name: "Aprobar cuenta" })).toHaveCount(0);
  await section.getByLabel("Motivo del rechazo").fill("El titular del certificado es otra persona");
  await section.getByRole("button", { name: "Rechazar cuenta" }).click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({ reason: "El titular del certificado es otra persona" });
});

test("the proof opens through the ops session", async ({ page }) => {
  let proofRequested = false;
  await openOps(page, {
    accounts: [account()],
    onRequest: async (route, { path, request }) => {
      if (path === "/internal/payout_accounts/pa_1/proof") { proofRequested = request.headers().authorization === "Bearer opss_test"; await route.fulfill({ contentType: "application/pdf", body: "%PDF-1.7" }); return true; }
      return false;
    },
  });
  await page.goto("/#cuentas");
  await page.locator("#cuentas").getByRole("button", { name: "Ver comprobante" }).click();
  await expect.poll(() => proofRequested).toBe(true);
});

test("the identity review shows its account's status and opens its proof", async ({ page }) => {
  let proofRequested = false;
  const submission = {
    id: "kyc_1", targetLevel: 1, legalName: "Ana Pérez", taxId: null, legalRepName: "Ana Pérez", legalRepDocumentId: "7654321", payoutBankAccount: "Banco Nacional de Bolivia 4012345678 — Ana Pérez",
    ciFrontDocId: null, ciBackDocId: null, selfieDocId: null, createdAt: "2026-10-08T15:00:00.000Z",
    merchant: { id: "m_1", name: "Tienda Uno", email: "t@example.com", settlementMode: "AGGREGATOR", level: 0 },
    payoutAccounts: [{ id: "pa_1", status: "APPROVED", isChange: false, bankCode: "BNB", accountNumber: "4012345678", holderName: "Ana Pérez", ownerType: "PERSON" }],
  };
  await openOps(page, {
    onRequest: async (route, { path, request }) => {
      if (path === "/v1/merchants/kyc/pending") { await route.fulfill({ json: [submission] }); return true; }
      if (path === "/internal/payout_accounts/pa_1/proof") { proofRequested = request.headers().authorization === "Bearer opss_test"; await route.fulfill({ contentType: "application/pdf", body: "%PDF-1.7" }); return true; }
      return false;
    },
  });
  const row = page.locator('#rows tr[data-id="kyc_1"]');
  await expect(row).toContainText("Cuenta aprobada");
  await row.getByRole("button", { name: "Ver comprobante" }).click();
  await expect.poll(() => proofRequested).toBe(true);
});

test("payout accounts are masked to the bank and the last 4 digits", async ({ page }) => {
  await openOps(page);
  await expect.poll(() => page.evaluate(() => window.maskedValue("Banco Nacional de Bolivia 4012345678 — Ana Pérez"))).toBe("Banco Nacional de Bolivia ····5678 — Ana Pérez");
});
