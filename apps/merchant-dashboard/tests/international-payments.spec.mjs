import { expect, test } from "@playwright/test";

// Store shape and login/route-mocking setup mirror store-settings.spec.mjs's
// openDashboard helper (domain-shop.spec.mjs mounts an isolated widget fixture
// with no login flow, so it has nothing to copy for a full-dashboard test).
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

async function openOverview(page, stores = [store("store_1", "Primera")]) {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    // The test registers its own mocks for these paths before calling this
    // helper; defer to them instead of shadowing them here.
    if (path === "/merchants/balance" || path.startsWith("/merchants/international_payments")) {
      return route.fallback();
    }
    let body = {};
    if (path === "/stores") body = stores;
    else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
    else if (path === "/merchants/kyc") body = { status: "APPROVED" };
    else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
    else if (
      path === "/merchants/payouts" ||
      path === "/payment_intents" ||
      path === "/merchants/orders" ||
      path.includes("/categories") ||
      path.includes("/payment_links") ||
      path.includes("/operations/integrations") ||
      path.includes("/promo-codes") ||
      path.includes("/debt-collection-links") ||
      path.endsWith("/domains")
    )
      body = [];
    else if (path === "/merchants/finances")
      body = {
        totalRevenue: 0,
        paymentCount: 0,
        inventoryValue: 0,
        totalStoreViews: 0,
        topProducts: [],
        revenueByPaymentMethod: [],
        currency: "BOB",
      };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#dashboard-overview");
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-dashboard-view", "overview");
}

test("merchant sees separate BOB and USD balances and can request international payments", async ({ page }) => {
  await page.route("**/v1/merchants/balance", (route) => route.fulfill({ json: {
    payableBalance: 70000, currency: "BOB",
    balances: [{ currency: "BOB", payableBalance: 70000 }, { currency: "USD", payableBalance: 9000 }],
  } }));
  let requested = false;
  await page.route("**/v1/merchants/international_payments", (route) => route.fulfill({ json: {
    status: requested ? "REQUESTED" : "OFF", settlementMode: "AGGREGATOR", feeBps: 590,
    fxRateAvailable: true, usdPayoutAccountOnFile: false, note: null,
  } }));
  await page.route("**/v1/merchants/international_payments/request", (route) => {
    requested = true;
    return route.fulfill({ json: { status: "REQUESTED" } });
  });

  await openOverview(page);

  await expect(page.getByText("Saldo por desembolsar (BOB)")).toBeVisible();
  await expect(page.getByText("Saldo por desembolsar (USD)")).toBeVisible();
  const card = page.getByRole("region", { name: "Pagos internacionales" });
  await expect(card.getByText("5,9%")).toBeVisible();
  await card.getByRole("button", { name: "Solicitar activación" }).click();
  await expect(card.getByText("Solicitud en revisión.")).toBeVisible();
  await expect(card.getByText("Agrega una cuenta en USD")).toBeVisible();
});
