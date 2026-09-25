import { expect, test } from "@playwright/test";

// Every view must open without a script error; removals in dashboard.js
// surface here first, because one stale element lookup stops the whole script.
const VIEWS = ["overview", "progress", "stores", "store-settings", "products", "media", "marketing", "experiments", "integrations", "charge-links", "cobros", "proposals", "inbox", "payments", "payouts", "account", "compliance", "workspace"];

test("every dashboard view opens without script errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "smoke");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:5175/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><main>Tienda</main>" }));
  await page.route("http://localhost:3001/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace("/v1", "");
    let body = [];
    if (path === "/stores") body = [{ id: "store_1", merchantId: "m1", slug: "tienda", name: "Tienda", status: "ACTIVE", websiteRevision: 0, heroSlides: [], contentOrder: [], editorialGallery: [], links: [], locations: [], animations: [], customDomains: [], checkoutMode: "payment" }];
    else if (path === "/merchants/balance") body = { payableBalance: 0 };
    else if (path === "/merchants/kyc") body = { status: "APPROVED" };
    else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
    else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
    else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
    else if (path.endsWith("/source-project")) body = { revision: 0, versions: [], nextBefore: null };
    else if (path.endsWith("/domain-shop")) body = { available: false, sandbox: true, tlds: [], orders: [] };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#dashboard-overview");
  await expect(page.locator("body")).toHaveClass(/is-logged-in/);
  for (const view of VIEWS) {
    await page.evaluate((target) => window.setDashboardView(target), view);
    await expect(page.locator("body")).toHaveAttribute("data-dashboard-view", view);
  }
  expect(errors).toEqual([]);
});
