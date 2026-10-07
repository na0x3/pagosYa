import { expect, test } from "@playwright/test";

const store = (id, name) => ({
  id,
  merchantId: "merchant_1",
  slug: id,
  name,
  websiteRevision: 0,
  websitePublishedRevision: 0,
  websiteDraft: null,
  status: "ACTIVE",
  backgroundColor: "#f8fafc",
  backgroundMode: "solid",
  backgroundGradientStart: "#f8fafc",
  backgroundGradientEnd: "#e0e7ff",
  backgroundGradientAngle: 135,
  heroSlides: [],
  contentOrder: ["hero", "about", "gallery", "products", "links"],
  experienceStyle: "editorial-grid",
  motionDuoEnabled: false,
  motionExperience: "clarity-marquee",
  motionExperiences: ["clarity-marquee"],
  animations: [],
  editorialGallery: [],
  links: [],
  customDomains: [],
  checkoutMode: "payment",
  contactPhone: null,
  contactEmail: null,
  contactFormEnabled: false,
  contactFormEmail: null,
  locationMapUrl: null,
  locationDescription: null,
  locationHighlight: null,
  locations: [],
  leadCaptureUrl: null,
  cartRecommendationsEnabled: true,
  cartRecommendationProductIds: [],
  showLowStockToCustomers: false,
});

async function openDashboard(page, stores, responseForRequest) {
  const requests = [];
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const contentType = request.headers()["content-type"] || "";
    requests.push({
      path,
      method: request.method(),
      body: contentType.includes("application/json") ? request.postDataJSON() : undefined,
    });
    const customBody = await responseForRequest?.({ path, request });
    let body = customBody ?? {};
    if (customBody === undefined) {
      if (path === "/stores") body = stores;
      else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
      else if (path === "/merchants/balance") body = { payableBalance: 0 };
      else if (path === "/merchants/kyc") body = { status: "APPROVED" };
      else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
      else if (path === "/merchants/payouts" || path === "/payment_intents" || path === "/merchants/orders" || path.includes("/categories") || path.includes("/payment_links") || path.includes("/operations/integrations") || path.includes("/promo-codes") || path.includes("/debt-collection-links") || path.endsWith("/domains")) body = [];
      else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
      else if (path.endsWith("/settings")) body = { ...request.postDataJSON(), websiteRevision: request.postDataJSON().revision + 1 };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  // The sidebar picker is the dashboard's own signal that the store list has loaded.
  await page.goto("/#dashboard-stores");
  await expect(page.locator("#sidebarStorePicker")).toContainText(stores[0].name);
  return requests;
}

async function goToPayments(page) {
  // On desktop the sidebar is docked; only narrow screens tuck it behind the handle.
  const handle = page.locator("#storeFullscreenNavHandle");
  if (await handle.isVisible() && !(await page.locator(".dashboard-sidebar").evaluate((element) => element.classList.contains("is-store-nav-pinned")))) await handle.click();
  const link = page.locator('.dashboard-nav-button[data-dashboard-view="payments"]');
  // The link sits inside a <details> nav group that starts closed.
  await link.evaluate((element) => element.closest("details.dashboard-nav-group")?.setAttribute("open", ""));
  await link.click();
  // Payments owns its page, so its block opens without a click.
  await expect(page.locator("#paymentsSectionBody")).toBeVisible();
}

// Task 14 shipped src/shipment-panel.mjs, lazily imported from index.html when
// a merchant opens an order's "Ver datos" <details>. Task 16 verification
// found that server.mjs's /src/* allowlist did not include
// /src/shipment-panel.mjs, so the dynamic import 404s in real use and the
// panel never renders. This test drives the real server.mjs (not a unit-test
// stub) to prove the fix: opening "Ver datos" for an order with a booked
// manual shipment renders the carrier name and the waybill download button.
test("opening Ver datos lazily loads and renders the shipment panel for a booked shipment", async ({ page }) => {
  const order = {
    id: "pi_1",
    orderId: "order_1",
    amount: 15000,
    status: "PAID",
    paymentMethodType: "card",
    createdAt: new Date().toISOString(),
    description: "1 producto",
    fulfillmentStatus: "PREPARING",
  };
  const shipment = {
    id: "shp_1",
    status: "BOOKED",
    carrier: { name: "Servientrega" },
    trackingNumber: null,
    hasLabel: true,
    events: [],
  };
  let shipmentRequests = 0;
  const requests = await openDashboard(page, [store("store_1", "Primera")], ({ path }) => {
    if (path === "/merchants/orders") return [order];
    if (path === "/orders/order_1/shipment") { shipmentRequests += 1; return shipment; }
    return undefined;
  });

  await goToPayments(page);

  const row = page.locator("#paymentRows tr", { hasText: "1 producto" });
  await expect(row).toBeVisible();
  const panel = row.locator("[data-shipment-panel]");
  await expect(panel).toHaveCount(1);
  await expect(panel).toBeEmpty();
  expect(shipmentRequests).toBe(0);

  await row.locator("summary", { hasText: "Ver datos" }).click();

  await expect(panel.locator(".shipment-panel")).toBeVisible();
  await expect(panel).toContainText("Servientrega");
  await expect(panel.locator("[data-shipment-label]")).toHaveText("Descargar guía (PDF)");
  expect(shipmentRequests).toBe(1);
  expect(requests.some((r) => r.path === "/orders/order_1/shipment")).toBe(true);

  // Closing and reopening must not re-fetch: the panel is cached once loaded.
  await row.locator("summary", { hasText: "Ver datos" }).click();
  await row.locator("summary", { hasText: "Ver datos" }).click();
  await expect(panel.locator(".shipment-panel")).toBeVisible();
  expect(shipmentRequests).toBe(1);
});
