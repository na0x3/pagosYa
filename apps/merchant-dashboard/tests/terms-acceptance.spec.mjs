import { expect, test } from "@playwright/test";

// Login and route-mocking setup mirror international-payments.spec.mjs, with KYC
// not yet submitted so the compliance page shows the verification form.
const store = {
  id: "store_1",
  merchantId: "merchant_1",
  slug: "store_1",
  name: "Primera",
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
};

const inForce = { version: "2026-10-01", title: "Términos y Condiciones para comercios", effectiveAt: "2026-09-01T00:00:00.000Z", sha256: "a".repeat(64) };

async function openCompliance(page, termsHandler) {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    if (path.startsWith("/dashboard/terms")) return termsHandler(route);
    let body = {};
    if (path === "/stores") body = [store];
    else if (path.startsWith("/dashboard/limits")) body = null;
    else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
    else if (path === "/merchants/kyc") body = { status: "NOT_SUBMITTED" };
    else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
    else if (path === "/merchants/balance") body = { payableBalance: 0, currency: "BOB", balances: [] };
    else if (path === "/merchants/international_payments") body = { status: "OFF", settlementMode: "AGGREGATOR", feeBps: 590, fxRateAvailable: true, usdPayoutAccountOnFile: false, note: null };
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
      body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#dashboard-compliance");
  await expect(page.locator("#app")).toBeVisible();
  await page.getByRole("button", { name: "Mostrar Verificación (KYC)" }).click();
  await expect(page.locator("#kycForm")).toBeVisible();
}

test("a merchant must accept the terms in force before sending KYC", async ({ page }) => {
  let accepted = null;
  await openCompliance(page, (route) => {
    if (route.request().method() === "POST") {
      accepted = JSON.parse(route.request().postData() || "{}");
      return route.fulfill({ json: { current: inForce, upcoming: null, acceptedVersion: inForce.version, needsAcceptance: false } });
    }
    return route.fulfill({ json: { current: inForce, upcoming: null, acceptedVersion: null, needsAcceptance: true } });
  });

  const prompt = page.locator("#termsPrompt");
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("Términos y Condiciones para comercios");
  await expect(page.locator("#termsPromptLink")).toHaveAttribute("href", "https://pagosya.bo/terminos/comercios?version=2026-10-01");
  await expect(page.locator("#kycForm button[type=submit]")).toBeDisabled();

  await page.locator("#termsAcceptButton").click();

  await expect(prompt).toBeHidden();
  expect(accepted).toEqual({ version: "2026-10-01" });
  await expect(page.locator("#kycForm button[type=submit]")).toBeEnabled();
});

test("announces an upcoming version without blocking KYC", async ({ page }) => {
  const upcoming = { ...inForce, version: "2026-12-01", effectiveAt: "2099-12-01T00:00:00.000Z" };
  await openCompliance(page, (route) =>
    route.fulfill({ json: { current: inForce, upcoming, acceptedVersion: inForce.version, needsAcceptance: false } }));

  await expect(page.locator("#termsPrompt")).toBeVisible();
  await expect(page.locator("#termsPromptWhen")).toContainText("vigente desde");
  await expect(page.locator("#kycForm button[type=submit]")).toBeEnabled();
});

test("shows no prompt while pagosYa has not published terms", async ({ page }) => {
  await openCompliance(page, (route) =>
    route.fulfill({ json: { current: null, upcoming: null, acceptedVersion: null, needsAcceptance: false } }));

  await expect(page.locator("#termsPrompt")).toBeHidden();
  await expect(page.locator("#kycForm button[type=submit]")).toBeEnabled();
});
