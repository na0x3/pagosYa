import { expect, test } from "@playwright/test";

// Pins the dashboard split (2026-10-15): screens moved out of dashboard.js must read the active store when they run, not
// when they were created. Switching store reloads products, discounts, debt links, orders, finances and the inbox for
// the store picked now, and the inbox shows that store's name.
const store = (id, name) => ({ id, merchantId: "m1", slug: id, name, status: "ACTIVE", websiteRevision: 0, heroSlides: [], contentOrder: [], editorialGallery: [], links: [], locations: [], animations: [], customDomains: [], checkoutMode: "payment" });

test("switching the active store reloads the moved screens for the new store", async ({ page }) => {
  const errors = [];
  const requested = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (window !== window.top) return;
    sessionStorage.setItem("pagosya_merchant_session", "switch");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:5175/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><main>Tienda</main>" }));
  await page.route("http://localhost:3001/v1/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/v1", "");
    requested.push(path + url.search);
    let body = [];
    if (path === "/stores") body = [store("store_1", "Primera"), store("store_2", "Segunda")];
    else if (path === "/merchants/balance") body = { payableBalance: 0 };
    else if (path === "/merchants/kyc") body = { status: "APPROVED" };
    else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
    else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
    else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
    else if (path.endsWith("/source-project")) body = { revision: 0, versions: [], nextBefore: null };
    else if (path.endsWith("/domain-shop")) body = { available: false, sandbox: true, tlds: [], orders: [] };
    else if (path.endsWith("/abandoned-carts")) body = { anonymousSessions: 0, carts: [] };
    else if (path.endsWith("/assistant/conversations")) body = { conversations: [] };
    else if (path.endsWith("/assistant/unanswered")) body = { questions: [] };
    else if (path.endsWith("/assistant")) body = { settings: { enabled: false, name: null, avatarUrl: null, greeting: null, formality: "tu", notes: "" }, usage: { used: 0, cap: 300, previewUsed: 0, previewCap: 50 }, platformEnabled: true, publishedDesign: true, coupons: [] };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/#dashboard-overview");
  await expect(page.locator("body")).toHaveClass(/is-logged-in/);
  await expect(page.locator("#sidebarStorePicker")).toHaveValue("store_1");
  await expect.poll(() => requested.includes("/stores/store_1/inbox")).toBe(true);
  requested.length = 0;

  await page.locator("#sidebarStorePicker").selectOption("store_2");

  for (const path of ["/stores/store_2/payment_links", "/stores/store_2/promo-codes", "/stores/store_2/debt-collection-links", "/merchants/orders?storeId=store_2", "/merchants/finances?storeId=store_2", "/stores/store_2/inbox"]) {
    await expect.poll(() => requested.includes(path), { message: path }).toBe(true);
  }
  await expect(page.locator("#sidebarStorePicker")).toHaveValue("store_2");
  await expect(page.locator("#inboxScopeLabel")).toHaveText("Segunda");
  expect(errors).toEqual([]);
});
