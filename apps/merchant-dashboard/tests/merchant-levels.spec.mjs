import { expect, test } from "@playwright/test";

// Login and route-mocking setup mirror terms-acceptance.spec.mjs, plus
// /dashboard/limits and the KYC document upload endpoints.
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

async function openCompliance(page, limits, posted = [], { kycStatus = "NOT_SUBMITTED", expectFormVisible = true } = {}) {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    if (request.method() === "POST") {
      let parsedBody = request.postData();
      try {
        parsedBody = JSON.parse(parsedBody);
      } catch {
        // leave as raw text/multipart for non-JSON posts
      }
      posted.push({ path, body: parsedBody });
      if (path === "/merchants/kyc/documents") {
        const raw = request.postDataBuffer();
        const text = raw ? raw.toString("latin1") : "";
        const match = text.match(/name="slot"\r\n\r\n(\w+)/);
        const slot = match ? match[1] : null;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "doc_" + slot, slot }) });
      }
      if (path === "/merchants/kyc") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "PENDING_REVIEW" }) });
      }
    }
    if (path.startsWith("/dashboard/limits")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(limits) });
    }
    if (path.startsWith("/dashboard/terms")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ current: null, upcoming: null, acceptedVersion: null, needsAcceptance: false }),
      });
    }
    let body = {};
    if (path === "/stores") body = [store];
    else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
    else if (path === "/merchants/kyc") body = { status: kycStatus };
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
  // The compliance section itself is a collapsible panel independent of KYC
  // status; expand it regardless of whether the form ends up visible.
  const complianceToggle = page.getByRole("button", { name: "Mostrar Verificación (KYC)" });
  if (await complianceToggle.count()) await complianceToggle.click();
  if (expectFormVisible) await expect(page.locator("#kycForm")).toBeVisible();
}

const usage = (over = {}) => ({ level: 1, levelName: "Persona", liveEnabled: true, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, used: 620_000, month: "2026-09", resetsAt: "2026-10-01T04:00:00.000Z", ...over });

test("shows the level, usage and reset date", async ({ page }) => {
  await openCompliance(page, usage());
  await expect(page.locator("#levelName")).toHaveText("Nivel 1 · Persona");
  await expect(page.locator("#levelUsage")).toHaveText("Bs 6.200 de Bs 10.000 este mes");
  await expect(page.locator("#levelPerPayment")).toHaveText("Máximo por pago: Bs 2.000");
  await expect(page.locator("#limitBanner")).toBeHidden();
});

test("warns at 80% and blocks at 100%", async ({ page }) => {
  await openCompliance(page, usage({ used: 800_000 }));
  await expect(page.locator("#limitBanner")).toHaveAttribute("data-state", "warn");
  await page.unrouteAll();
  await openCompliance(page, usage({ used: 1_000_000 }));
  await page.reload();
  await expect(page.locator("#limitBanner")).toHaveAttribute("data-state", "blocked");
});

test("uploads three photos and submits a level 1 application without NIT", async ({ page }) => {
  const posted = [];
  await openCompliance(page, usage({ level: 0, levelName: "Sin verificar", liveEnabled: false, monthlyLimit: null, perPaymentLimit: null, used: 0 }), posted);
  await expect(page.locator("#kycTargetLevel")).toHaveValue("1");
  await expect(page.locator("#kycBusinessFields")).toBeHidden();
  const photo = { name: "ci.png", mimeType: "image/png", buffer: Buffer.from("89504e47", "hex") };
  for (const id of ["#kycDocFront", "#kycDocBack", "#kycDocSelfie"]) await page.setInputFiles(id, photo);
  await page.fill("#kycForm [name=legalName]", "Juana Mamani");
  await page.fill("#kycForm [name=legalRepDocumentId]", "7654321 LP");
  await page.fill("#kycForm [name=payoutBankAccount]", "BNB 4012345678");
  await page.click("#kycForm button[type=submit]");
  await expect.poll(() => posted.find((p) => p.path === "/merchants/kyc")?.body)
    .toMatchObject({ targetLevel: 1, ciFrontDocId: "doc_CI_FRONT", ciBackDocId: "doc_CI_BACK", selfieDocId: "doc_SELFIE" });
  expect(posted.find((p) => p.path === "/merchants/kyc").body.taxId).toBeUndefined();
});

test("asks for NIT when applying for level 2", async ({ page }) => {
  await openCompliance(page, usage());
  await expect(page.locator("#kycTargetLevel")).toHaveValue("2");
  await expect(page.locator("#kycBusinessFields")).toBeVisible();
  await expect(page.locator("#kycForm [name=taxId]")).toHaveAttribute("required", "");
});

test("an approved level 1 merchant still sees the level card and can apply for level 2", async ({ page }) => {
  await openCompliance(page, usage(), [], { kycStatus: "APPROVED" });
  await expect(page.locator("#levelCard")).toBeVisible();
  await expect(page.locator("#kycForm")).toBeVisible();
  await expect(page.locator("#kycTargetLevel")).toHaveValue("2");
});

test("an approved level 2 merchant sees the card and the level 3 button but not the form", async ({ page }) => {
  await openCompliance(page, usage({ level: 2, levelName: "Negocio" }), [], { kycStatus: "APPROVED", expectFormVisible: false });
  await expect(page.locator("#levelCard")).toBeVisible();
  await expect(page.locator("#level3RequestButton")).toBeVisible();
  await expect(page.locator("#kycForm")).toBeHidden();
});
