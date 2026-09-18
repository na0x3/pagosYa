import { expect, test } from "@playwright/test";

test("merchant operates customers, stock, agenda, subscriptions, and external connections from one workspace", async ({ page }) => {
  test.setTimeout(process.env.PAGOSYA_VISUAL_QA === "1" ? 120_000 : 30_000);
  const requests = [];
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
    sessionStorage.setItem("pagosya_current_store_id", "store_1");
  });
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    requests.push({ path, method: request.method(), body: request.postDataJSON?.() });
    const finances = {
      totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0,
      topProducts: [], revenueByPaymentMethod: [], salesByWeekday: [], stars: [], currency: "BOB",
    };
    let body = {};
    if (path === "/stores") body = [{
      id: "store_1", merchantId: "merchant_1", slug: "estudio", name: "Estudio Norte", status: "ACTIVE",
      checkoutMode: "payment", backgroundColor: "#f8fafc", heroSlides: [], contentOrder: [], animations: [],
      editorialGallery: [], links: [], customDomains: [], cartRecommendationProductIds: [],
    }];
    else if (path === "/merchants/balance") body = { payableBalance: 0 };
    else if (path === "/merchants/kyc") body = { status: "APPROVED" };
    else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
    else if (path === "/merchants/finances") body = finances;
    else if (path === "/merchants/payouts" || path === "/merchants/orders") body = [];
    else if (path.includes("/categories") || path.includes("/promo-codes") || path.includes("/debt-collection-links") || path.endsWith("/domains")) body = [];
    else if (path.endsWith("/payment_links")) body = [{ id: "prod_1", name: "Kit facial", amount: 12900, currency: "BOB", stock: 3, status: "ACTIVE", imageUrls: [] }];
    else if (path === "/stores/store_1/operations/calendar/events") body = {
      summary: { total: 2, overdue: 1, syncErrors: 1 },
      events: [
        { id: "restock:po_1", type: "RESTOCK", title: "Reposición · Laboratorio Norte", detail: "12 uds. · Kit facial", startsAt: new Date().toISOString(), status: "ORDERED", urgency: "TODAY", source: { kind: "PURCHASE_ORDER", id: "po_1" }, action: { kind: "RECEIVE_PURCHASE_ORDER", label: "Recibir stock" } },
        { id: "integration-error:sync_1", type: "INTEGRATION_ERROR", title: "Falló sincronización · ERP central", detail: "SKU inválido", startsAt: new Date().toISOString(), status: "FAILED", urgency: "OVERDUE", source: { kind: "INTEGRATION_SYNC", id: "sync_1" }, action: { kind: "OPEN_CONNECTIONS", label: "Revisar conexión" } },
      ],
    };
    else if (path === "/stores/store_1/operations") body = {
      summary: { customers: 18, lowStock: 3, upcomingAppointments: 5, activeSubscriptions: 12 },
      customers: [{ id: "cus_1", name: "María Pérez", email: "maria@example.com", orderCount: 7, lifetimeValue: 86400, loyaltyPoints: 120 }],
      inventory: { lowStockProducts: [{ id: "prod_1", name: "Kit facial", codigoProducto: "KIT-01", stock: 3 }] },
      appointments: { offerings: [{ id: "svc_1", name: "Consulta facial", durationMinutes: 45 }], upcoming: [], calendarConnection: null },
      delivery: { zones: [], couriers: [], assignments: [] }, returns: [],
      pos: { sessions: [], sales: [] }, reconciliation: [],
      subscriptions: {
        plans: [{ id: "plan_1", name: "Club Café mensual", amount: 15000, currency: "BOB", interval: "MONTHLY", intervalCount: 1 }],
        customers: [{ id: "subscription_1", planId: "plan_1", customerName: "María Pérez", customerEmail: "maria@example.com", status: "ACTIVE", nextBillingAt: "2026-09-22T12:00:00.000Z", plan: { id: "plan_1", name: "Club Café mensual", amount: 15000, currency: "BOB", interval: "MONTHLY", intervalCount: 1 }, invoices: [{ id: "invoice_1", dueAt: "2026-08-22T12:00:00.000Z", amount: 15000, displayStatus: "OVERDUE" }] }],
        invoices: [{ id: "invoice_1", subscriptionId: "subscription_1", dueAt: "2026-08-22T12:00:00.000Z", amount: 15000, currency: "BOB", status: "DUE", displayStatus: "OVERDUE", paymentStatus: "REQUIRES_PAYMENT_METHOD", reminderCount: 1, checkoutUrl: "http://localhost:5174/#client_secret=pi_test_secret" }],
      },
      integrations: [{ id: "integration_1", name: "ERP central", kind: "CUSTOM_DATABASE", status: "ACTIVE", lastSyncAt: null, health: "NOT_SYNCED", mappedCustomers: 1, mappedSubscriptions: 1, incompleteCustomers: 0 }],
      automations: [],
    };
    else if (path === "/stores/store_1/operations/integrations" && request.method() === "POST") body = {
      id: "integration_new",
      name: request.postDataJSON().name,
      kind: request.postDataJSON().kind,
      status: "ACTIVE",
      secret: "sync_new_connection_secret",
    };
    else if (path === "/stores/store_1/operations/integrations" && request.method() === "GET") body = [
      { id: "integration_1", name: "ERP central", kind: "CUSTOM_DATABASE", status: "ACTIVE" },
      { id: "integration_new", name: "Postgres ventas", kind: "CUSTOM_DATABASE", status: "ACTIVE" },
    ];
    else if (path === "/integrations/integration_new/ping" && request.method() === "POST") body = {
      connected: true,
      connectionId: "integration_new",
      name: "Postgres ventas",
      kind: "CUSTOM_DATABASE",
      checkedAt: new Date().toISOString(),
      capabilities: ["stock", "subscriptions"],
    };
    else if (path === "/stores/store_1/operations/customers" && request.method() === "POST") body = { id: "cus_2", ...request.postDataJSON() };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/#dashboard-operations");
  await page.locator("dialog[open]").evaluateAll((dialogs) => dialogs.forEach((dialog) => dialog.close()));
  await page.locator("#assistantClose").evaluate((button) => button.click()).catch(() => undefined);

  await expect(page.locator("[data-operations-tab]")).toHaveCount(6);
  await expect(page.locator("#operationsLowStockCount")).toHaveText("3");
  await expect(page.locator("#operationsDueCount")).toHaveText("1");
  await expect(page.locator("#operationsCustomersList")).toContainText("María Pérez");
  await page.locator('[data-operations-tab="appointments"]').evaluate((button) => button.click());
  await expect(page.locator("#operationsCalendarGrid")).toContainText("Reposición");
  await expect(page.locator("#operationsAgendaList")).toContainText("Laboratorio Norte");
  if (process.env.PAGOSYA_VISUAL_QA === "1") await page.locator(".operations-calendar-layout").screenshot({ path: ".impeccable/operations-calendar-desktop.png", animations: "disabled" });
  await page.locator('[data-operations-tab="connections"]').evaluate((button) => button.click());
  await page.locator("dialog[open]").evaluateAll((dialogs) => dialogs.forEach((dialog) => dialog.close()));
  await page.locator("#assistantClose").evaluate((button) => button.click()).catch(() => undefined);
  await expect(page.locator("#operationsMappingConnection")).toHaveValue("integration_1");
  await expect(page.locator("#operationsMappingProduct")).toHaveValue("prod_1");
  await expect(page.locator("#operationsSubscriptionMappingConnection")).toHaveValue("integration_1");
  await expect(page.locator("#operationsSubscriptionMappingPlan")).toHaveValue("plan_1");
  await page.locator("#operationsIntegrationName").fill("Postgres ventas");
  const createConnectionRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/v1/stores/store_1/operations/integrations" && request.method() === "POST");
  await page.locator("#operationsIntegrationForm").evaluate((form) => form.requestSubmit());
  await expect((await createConnectionRequest).postDataJSON()).toMatchObject({ name: "Postgres ventas", kind: "CUSTOM_DATABASE" });
  await expect(page.locator("#operationsIntegrationSetup")).toBeVisible();
  await expect(page.locator("#operationsIntegrationSecretValue")).toHaveValue("sync_new_connection_secret");
  const pingRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/v1/integrations/integration_new/ping" && request.method() === "POST");
  await page.locator("#operationsTestIntegration").click();
  await pingRequest;
  await expect(page.locator("#operationsIntegrationTestStatus")).toContainText("Conexión verificada");
  await expect(page.locator("#operationsContinueIntegration")).toBeVisible();
  if (process.env.PAGOSYA_VISUAL_QA === "1") {
    await page.locator('[data-operations-pane="connections"]').screenshot({ path: ".impeccable/external-subscriptions-desktop.png", animations: "disabled" });
  } else {
    await page.locator('#operationsSubscriptionMappingForm [name="externalPlanCode"]').fill("CAFE-MENSUAL");
    const planMappingRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/v1/stores/store_1/operations/integrations/integration_1/subscription-plan-mappings" && request.method() === "POST");
    await page.locator("#operationsSubscriptionMappingForm").evaluate((form) => form.requestSubmit());
    await expect((await planMappingRequest).postDataJSON()).toMatchObject({ subscriptionPlanId: "plan_1", externalPlanCode: "CAFE-MENSUAL" });
  }

  await page.locator('[data-operations-tab="finance"]').evaluate((button) => button.click());
  await expect(page.locator("#operationsSubscriptionsList")).toContainText("Club Café mensual");
  await expect(page.locator("#operationsSubscriptionsList")).toContainText("Activo");
  await expect(page.locator("#operationsInvoicesList")).toContainText("Vencido");
  await expect(page.locator(".operations-payment-link")).toHaveAttribute("href", "http://localhost:5174/#client_secret=pi_test_secret");
  await page.locator('#operationsPlanForm [name="name"]').fill("Corte semanal");
  await page.locator('#operationsPlanForm [name="amount"]').fill("50");
  await expect(page.locator("#operationsPlanPreview")).toContainText("Corte semanal");
  await page.locator('.operations-subscription-status[data-status="PAUSED"]').click();
  await expect.poll(() => requests.some((entry) => entry.path === "/stores/store_1/operations/subscriptions/subscription_1" && entry.method === "PATCH" && entry.body?.status === "PAUSED")).toBe(true);

  if (process.env.PAGOSYA_VISUAL_QA !== "1") {
    await page.locator('[data-operations-tab="customers"]').evaluate((button) => button.click());
    await page.locator('#operationsCustomerForm [name="name"]').fill("Lucía Vargas");
    await page.locator('#operationsCustomerForm [name="email"]').fill("lucia@example.com");
    await page.locator("#operationsCustomerForm").evaluate((form) => form.requestSubmit());
    await expect.poll(() => requests.some((entry) => entry.path === "/stores/store_1/operations/customers" && entry.method === "POST" && entry.body?.name === "Lucía Vargas")).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("dialog[open]").evaluateAll((dialogs) => dialogs.forEach((dialog) => dialog.close()));
  await page.locator('[data-operations-tab="appointments"]').evaluate((button) => button.click());
  if (process.env.PAGOSYA_VISUAL_QA === "1") await page.locator(".operations-calendar-layout").screenshot({ path: ".impeccable/operations-calendar-mobile.png", animations: "disabled" });
  await page.locator('[data-operations-tab="connections"]').evaluate((button) => button.click());
  await expect(page.locator('[data-operations-tab="connections"]')).toBeInViewport();
  await expect(page.locator("#operationsSection")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (process.env.PAGOSYA_VISUAL_QA === "1") await page.locator('[data-operations-pane="connections"]').screenshot({ path: ".impeccable/external-subscriptions-mobile.png", animations: "disabled" });
});
