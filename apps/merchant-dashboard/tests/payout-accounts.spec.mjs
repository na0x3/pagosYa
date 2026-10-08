import { expect, test } from "@playwright/test";

const store = {
  id: "store_1", merchantId: "merchant_1", slug: "store_1", name: "Primera", websiteRevision: 0, websitePublishedRevision: 0, websiteDraft: null, status: "ACTIVE",
  backgroundColor: "#f8fafc", backgroundMode: "solid", backgroundGradientStart: "#f8fafc", backgroundGradientEnd: "#e0e7ff", backgroundGradientAngle: 135,
  heroSlides: [], contentOrder: ["hero", "about", "gallery", "products", "links"], experienceStyle: "editorial-grid", motionDuoEnabled: false,
  motionExperience: "clarity-marquee", motionExperiences: ["clarity-marquee"], animations: [], editorialGallery: [], links: [], customDomains: [],
  checkoutMode: "payment", contactPhone: null, contactEmail: null, contactFormEnabled: false, contactFormEmail: null, locationMapUrl: null,
  locationDescription: null, locationHighlight: null, locations: [], leadCaptureUrl: null, cartRecommendationsEnabled: true, cartRecommendationProductIds: [], showLowStockToCustomers: false,
};


const approved = { id: "pa_a", bankCode: "BNB", bankName: "Banco Nacional de Bolivia", accountLast4: "5678", holderName: "Ana Pérez", status: "APPROVED", isChange: false, payableFrom: "2026-10-01T15:00:00.000Z", reviewNote: null, createdAt: "2026-10-01T15:00:00.000Z" };
const png = { name: "cert.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]) };

async function openDashboard(page, { accounts, onCreate, onKyc }) {
  let list = accounts;
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/dashboard/payout_accounts" && request.method() === "POST") {
      onCreate?.(request);
      const created = { ...approved, id: "pa_new", status: "PENDING_REVIEW", isChange: list.some((a) => a.status === "APPROVED"), accountLast4: "1234", createdAt: "2026-10-08T15:00:00.000Z", payableFrom: null };
      list = [created, ...list];
      return json(created);
    }
    if (path === "/dashboard/payout_accounts") return json(list);
    if (path === "/merchants/kyc" && request.method() === "POST") { onKyc?.(JSON.parse(request.postData())); return json({ id: "kyc_1", status: "PENDING_REVIEW" }); }
    if (path === "/merchants/kyc/documents") return json({ id: `doc_${Math.random().toString(36).slice(2, 7)}` });
    if (path === "/merchants/kyc") return json({ status: "NOT_SUBMITTED" });
    if (path === "/merchants/balance") return json({ payableBalance: 0, currency: "BOB", payoutsHeld: false, balances: [] });
    if (path === "/stores") return json([store]);
    if (path.endsWith("/visual-studio")) return json({ proposals: [], versions: [] });
    if (path === "/merchants/invoicing_profile") return json({ status: "NOT_CONFIGURED" });
    if (path === "/merchants/international_payments") return json({ available: false, status: "OFF", settlementMode: "AGGREGATOR", feeBps: 590, fxRateAvailable: true, usdPayoutAccountOnFile: false, note: null });
    if (path.startsWith("/dashboard/terms")) return json({ current: null, upcoming: null, acceptedVersion: null, needsAcceptance: false });
    if (path.startsWith("/dashboard/limits")) return json({ level: 0, levelName: "Sin verificar", liveEnabled: false, monthlyLimit: null, perPaymentLimit: null, used: 0, month: "2026-10", resetsAt: "2026-11-01T04:00:00.000Z" });
    if (path === "/merchants/finances") return json({ totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" });
    return json([]);
  });
}

test("the payouts page shows the approved account and sends a change with its proof", async ({ page }) => {
  const posts = [];
  await openDashboard(page, { accounts: [approved], onCreate: (request) => posts.push(request.postData() ?? "") });
  await page.goto("/#dashboard-payouts");
  const panel = page.locator("#payoutAccountPanel");
  await expect(panel).toContainText("Banco Nacional de Bolivia ····5678 · Ana Pérez");
  await panel.getByRole("button", { name: "Cambiar cuenta" }).click();
  await panel.locator('select[name="bankCode"]').selectOption("BUN");
  await panel.locator('input[name="accountNumber"]').fill("1000 1234");
  await panel.locator('input[name="holderName"]').fill("Ana Pérez");
  await panel.locator('input[name="proof"]').setInputFiles(png);
  await panel.getByRole("button", { name: "Enviar cambio" }).click();
  await expect(panel).toContainText("Estamos revisando tu cuenta bancaria.");
  expect(posts).toHaveLength(1);
  for (const part of ['name="bankCode"', "BUN", 'name="accountNumber"', 'name="holderName"', 'name="proof"']) expect(posts[0]).toContain(part);
});

test("a rejected change is explained and the old account stays", async ({ page }) => {
  const rejected = { ...approved, id: "pa_r", status: "REJECTED", isChange: true, reviewNote: "El titular es otra persona", createdAt: "2026-10-06T15:00:00.000Z", accountLast4: "9999" };
  await openDashboard(page, { accounts: [rejected, approved] });
  await page.goto("/#dashboard-payouts");
  const panel = page.locator("#payoutAccountPanel");
  await expect(panel).toContainText("Tu cambio de cuenta no fue aprobado: El titular es otra persona");
  await expect(panel).toContainText("····5678");
});

test("the identity form sends the account with its proof first, then the identity with its id", async ({ page }) => {
  const kyc = [];
  const posts = [];
  await openDashboard(page, { accounts: [], onCreate: (request) => posts.push(request.postData() ?? ""), onKyc: (body) => kyc.push(body) });
  await page.goto("/#dashboard-compliance");
  await expect(page.locator("#app")).toBeVisible();
  const complianceToggle = page.getByRole("button", { name: "Mostrar Verificación (KYC)" });
  if (await complianceToggle.count()) await complianceToggle.click();
  const form = page.locator("#kycForm");
  await expect(form).toBeVisible();
  await form.locator('input[name="legalName"]').fill("Ana Pérez");
  await form.locator('input[name="legalRepDocumentId"]').fill("7654321 LP");
  for (const id of ["#kycDocFront", "#kycDocBack", "#kycDocSelfie"]) await form.locator(id).setInputFiles(png);
  await form.locator('select[name="bankCode"]').selectOption("BNB");
  await form.locator('input[name="accountNumber"]').fill("4012345678");
  await form.locator('input[name="holderName"]').fill("Ana Pérez");
  await form.locator("#kycAccountProof").setInputFiles(png);
  await form.locator("button[type=submit]").click();
  await expect.poll(() => kyc.length).toBe(1);
  expect(posts).toHaveLength(1);
  expect(kyc[0].payoutAccountId).toBe("pa_new");
  for (const key of ["bankCode", "accountNumber", "holderName", "payoutBankAccount"]) expect(kyc[0]).not.toHaveProperty(key);
});

test("moving up a level reuses the approved account instead of asking again", async ({ page }) => {
  const kyc = [];
  await openDashboard(page, { accounts: [approved], onKyc: (body) => kyc.push(body) });
  await page.goto("/#dashboard-compliance");
  await expect(page.locator("#app")).toBeVisible();
  const complianceToggle = page.getByRole("button", { name: "Mostrar Verificación (KYC)" });
  if (await complianceToggle.count()) await complianceToggle.click();
  const form = page.locator("#kycForm");
  await expect(form).toBeVisible();
  await expect(form.locator("#kycAccountExisting")).toContainText("Banco Nacional de Bolivia ····5678");
  await expect(form.locator('select[name="bankCode"]')).toBeHidden();
  await form.locator('input[name="legalName"]').fill("Ana Pérez");
  await form.locator('input[name="legalRepDocumentId"]').fill("7654321 LP");
  for (const id of ["#kycDocFront", "#kycDocBack", "#kycDocSelfie"]) await form.locator(id).setInputFiles(png);
  await form.locator("button[type=submit]").click();
  await expect.poll(() => kyc.length).toBe(1);
  expect(kyc[0].payoutAccountId).toBe("pa_a");
});
