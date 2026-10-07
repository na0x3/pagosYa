import { expect, test } from "@playwright/test";

// Route-mocking setup mirrors merchant-dashboard's terms-acceptance.spec.mjs:
// seed sessionStorage with a token before the page's own script runs, then
// stub every endpoint the ops console's refresh() fans out to.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const kycSubmission = {
  id: "kyc_1",
  targetLevel: 1,
  ciFrontDocId: "doc_front",
  ciBackDocId: "doc_back",
  selfieDocId: "doc_selfie",
  taxId: null,
  legalRepName: "Juana Perez",
  legalRepDocumentId: "12345678",
  legalName: "Tienda Uno",
  payoutBankAccount: "1234567890",
  payoutUsdBankAccount: null,
  createdAt: "2026-09-20T12:00:00.000Z",
  merchant: { id: "merchant_1", name: "Tienda Uno", email: "tienda@example.com", settlementMode: "AGGREGATOR", level: 0 },
};

const policies = [
  { level: 0, name: "Nivel 0", liveEnabled: false, monthlyLimit: null, perPaymentLimit: null, payoutDelayDays: 7, reserveBps: 1000, reserveDays: 60 },
  { level: 1, name: "Nivel 1", liveEnabled: true, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, payoutDelayDays: 7, reserveBps: 1000, reserveDays: 60 },
  { level: 2, name: "Nivel 2", liveEnabled: true, monthlyLimit: 10_000_000, perPaymentLimit: 2_000_000, payoutDelayDays: 3, reserveBps: 500, reserveDays: 45 },
  { level: 3, name: "Nivel 3", liveEnabled: true, monthlyLimit: null, perPaymentLimit: null, payoutDelayDays: 1, reserveBps: 0, reserveDays: 0 },
];

const supportCaseSummary = {
  id: "case_1",
  merchant: { id: "merchant_1", name: "Tienda Uno", email: "tienda@example.com" },
  category: "PAYMENTS",
  status: "PENDING",
  priority: "NORMAL",
  updatedAt: "2026-09-20T12:00:00.000Z",
};

const dossier = {
  merchant: {
    id: "merchant_1",
    name: "Tienda Uno",
    email: "tienda@example.com",
    status: "ACTIVE",
    settlementMode: "AGGREGATOR",
    level: 1,
    monthlyLimitOverride: null,
    perPaymentLimitOverride: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    users: [],
    stores: [],
    paymentIntents: [],
    payouts: [],
    invoices: [],
    kycSubmissions: [],
  },
  supportCase: { ...supportCaseSummary, notes: [], summary: "El comercio pidió revisar su límite." },
};

async function openOps(page, { onRequest } = {}) {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_ops_api_origin", "http://localhost:3001");
    sessionStorage.setItem("pagosya_ops_token", "ops_test");
  });
  await page.route("http://localhost:3001/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (onRequest) {
      const handled = await onRequest(route, { path, method, request, url });
      if (handled) return;
    }

    if (path === "/internal/ops_users/me") return route.fulfill({ json: { name: "Ana Ops", email: "ana@pagosya.bo", role: "SUPPORT_ADMIN" } });
    if (path === "/v1/merchants/kyc/pending") return route.fulfill({ json: [kycSubmission] });
    if (/^\/v1\/merchants\/kyc\/[^/]+\/documents\/[^/]+$/.test(path)) {
      return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(PNG_BASE64, "base64") });
    }
    if (path === "/internal/delivery_failures") {
      return route.fulfill({
        json: {
          payouts: { exhausted: [], retrying: [] },
          invoices: { exhausted: [], retrying: [] },
          webhookEvents: { exhausted: [], retrying: [] },
        },
      });
    }
    if (path === "/internal/audit_log") return route.fulfill({ json: [] });
    if (path === "/internal/support/cases") return route.fulfill({ json: [supportCaseSummary] });
    if (path === "/internal/domain_orders") return route.fulfill({ json: [] });
    if (path === "/internal/international_payments") return route.fulfill({ json: [] });
    if (path === "/internal/limits/policies") return route.fulfill({ json: policies });
    if (path === "/internal/limits/settings") return route.fulfill({ json: { usdToBobRate: "6.96" } });
    if (path === "/internal/limits/near_limit") return route.fulfill({ json: [] });
    if (path === "/internal/support/merchants/merchant_1") return route.fulfill({ json: dossier });
    if (path === "/internal/payout_holds") return route.fulfill({ json: [] });
    if (path === "/internal/merchants/merchant_1/settlement") return route.fulfill({ json: { merchantId: "merchant_1", overrides: { payoutDelayDaysOverride: null, reserveBpsOverride: null, reserveDaysOverride: null }, hold: null, policy: { level: 1, levelName: "Persona", delayDays: 7, reserveBps: 1000, reserveDays: 60 }, balances: [], releases: [] } });

    return route.fulfill({ status: 404, json: { message: "no mock for " + path } });
  });
  await page.goto("/");
  await expect(page.locator("#whoami")).toContainText("Ana Ops");
}

test("a pending level-1 submission shows its level and the approve label, and loads photos only on demand", async ({ page }) => {
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

  // Every fetch of a KYC document photo writes a kyc.document_viewed audit
  // row; loading all three for every submission on every queue refresh would
  // make that trail meaningless. Track these requests to prove they only
  // happen once ops explicitly asks to see the photos.
  const documentRequests = [];
  await openOps(page, {
    onRequest: async (route, { path }) => {
      if (/^\/v1\/merchants\/kyc\/[^/]+\/documents\/[^/]+$/.test(path)) documentRequests.push(path);
      return false;
    },
  });

  const row = page.locator("#rows tr");
  await expect(row).toContainText("Nivel solicitado: 1");
  await expect(row).toContainText("Nivel actual: 0");
  await expect(page.getByRole("button", { name: "Aprobar nivel 1" })).toBeVisible();

  // Before clicking "Ver fotos": no document requests, no photos rendered.
  expect(documentRequests).toEqual([]);
  await expect(row.locator("img.kyc-photo")).toHaveCount(0);

  await row.getByRole("button", { name: "Ver fotos" }).click();

  const images = row.locator("img.kyc-photo");
  await expect(images).toHaveCount(3);
  await expect(images.nth(0)).toHaveAttribute("src", /^blob:/);
  await expect(images.nth(1)).toHaveAttribute("src", /^blob:/);
  await expect(images.nth(2)).toHaveAttribute("src", /^blob:/);
  expect(documentRequests).toHaveLength(3);

  expect(consoleErrors).toEqual([]);
});

test("the limits page shows policies in Bs and saves centavos", async ({ page }) => {
  let patchBody = null;
  await openOps(page, {
    onRequest: async (route, { path, method }) => {
      if (path === "/internal/limits/policies/1" && method === "PATCH") {
        patchBody = JSON.parse(route.request().postData());
        await route.fulfill({ json: { level: 1, name: "Nivel 1", liveEnabled: patchBody.liveEnabled, monthlyLimit: patchBody.monthlyLimit, perPaymentLimit: patchBody.perPaymentLimit } });
        return true;
      }
      return false;
    },
  });

  const row = page.locator('#policiesRows tr[data-level="1"]');
  await expect(row.locator(".policy-monthly")).toHaveValue("10000");
  await expect(row.locator(".policy-per-payment")).toHaveValue("2000");
  // A live, non-Empresa level always needs both limits — the API refuses a
  // blank one, so the placeholder must not read "Sin límite" any more.
  await expect(row.locator(".policy-monthly")).toHaveAttribute("placeholder", "Requerido");
  await expect(row.locator(".policy-per-payment")).toHaveAttribute("placeholder", "Requerido");

  await row.locator(".policy-monthly").fill("20000");
  await row.locator(".policy-per-payment").fill("3000");
  await row.locator("button.policy-save").click();

  await expect.poll(() => patchBody).toEqual({ monthlyLimit: 2_000_000, perPaymentLimit: 300_000, liveEnabled: true, payoutDelayDays: 7, reserveBps: 1000, reserveDays: 60 });
});

test("level 3's policy limits can be left blank — Empresa always runs on its own per-merchant overrides", async ({ page }) => {
  let patchBody = null;
  await openOps(page, {
    onRequest: async (route, { path, method }) => {
      if (path === "/internal/limits/policies/3" && method === "PATCH") {
        patchBody = JSON.parse(route.request().postData());
        await route.fulfill({ json: { level: 3, name: "Nivel 3", liveEnabled: patchBody.liveEnabled, monthlyLimit: patchBody.monthlyLimit, perPaymentLimit: patchBody.perPaymentLimit } });
        return true;
      }
      return false;
    },
  });

  const row = page.locator('#policiesRows tr[data-level="3"]');
  await expect(row.locator(".policy-monthly")).toHaveAttribute("placeholder", "Definido por comercio");
  await expect(row.locator(".policy-per-payment")).toHaveAttribute("placeholder", "Definido por comercio");
  await row.locator("button.policy-save").click();

  await expect.poll(() => patchBody).toEqual({ monthlyLimit: null, perPaymentLimit: null, liveEnabled: true, payoutDelayDays: 1, reserveBps: 0, reserveDays: 0 });
});

test("a 403 saving a policy shows the API message in the error element", async ({ page }) => {
  await openOps(page, {
    onRequest: async (route, { path, method }) => {
      if (path === "/internal/limits/policies/1" && method === "PATCH") {
        await route.fulfill({ status: 403, json: { message: "Solo un administrador puede cambiar límites" } });
        return true;
      }
      return false;
    },
  });

  const row = page.locator('#policiesRows tr[data-level="1"]');
  await row.locator("button.policy-save").click();

  await expect(page.locator("#error")).toContainText("Solo un administrador puede cambiar límites");
});

test("the merchant detail form sends level and overrides", async ({ page }) => {
  let patchBody = null;
  await openOps(page, {
    onRequest: async (route, { path, method }) => {
      if (path === "/internal/merchants/merchant_1/limits" && method === "PATCH") {
        patchBody = JSON.parse(route.request().postData());
        await route.fulfill({ json: { id: "merchant_1", level: patchBody.level, monthlyLimitOverride: patchBody.monthlyLimitOverride, perPaymentLimitOverride: patchBody.perPaymentLimitOverride } });
        return true;
      }
      return false;
    },
  });

  await page.locator('#supportCases button[data-case-id="case_1"]').click();
  await expect(page.locator("#merchantLimitsForm")).toBeVisible();

  await page.locator("#merchantLevelSelect").selectOption("2");
  await page.locator("#merchantMonthlyOverride").fill("500");
  await page.locator("#merchantPerPaymentOverride").fill("50");
  await page.locator("#merchantLimitsForm button[type=submit]").click();

  await expect.poll(() => patchBody).toEqual({ level: 2, monthlyLimitOverride: 50_000, perPaymentLimitOverride: 5_000 });
});
