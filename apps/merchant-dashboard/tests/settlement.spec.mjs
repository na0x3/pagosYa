import { expect, test } from "@playwright/test";

const store = {
  id: "store_1", merchantId: "merchant_1", slug: "store_1", name: "Primera", websiteRevision: 0, websitePublishedRevision: 0, websiteDraft: null, status: "ACTIVE",
  backgroundColor: "#f8fafc", backgroundMode: "solid", backgroundGradientStart: "#f8fafc", backgroundGradientEnd: "#e0e7ff", backgroundGradientAngle: 135,
  heroSlides: [], contentOrder: ["hero", "about", "gallery", "products", "links"], experienceStyle: "editorial-grid", motionDuoEnabled: false,
  motionExperience: "clarity-marquee", motionExperiences: ["clarity-marquee"], animations: [], editorialGallery: [], links: [], customDomains: [],
  checkoutMode: "payment", contactPhone: null, contactEmail: null, contactFormEnabled: false, contactFormEmail: null, locationMapUrl: null,
  locationDescription: null, locationHighlight: null, locations: [], leadCaptureUrl: null, cartRecommendationsEnabled: true, cartRecommendationProductIds: [], showLowStockToCustomers: false,
};

const schedule = {
  policy: { level: 1, levelName: "Persona", delayDays: 7, reserveBps: 1000, reserveDays: 60 },
  nextLevel: { level: 2, name: "Negocio", delayDays: 3, reserveBps: 500, reserveDays: 45 },
  releases: [{ date: "2026-10-08", currency: "BOB", toAvailable: 8_775, fromReserve: 0 }, { date: "2026-11-30", currency: "BOB", toAvailable: 0, fromReserve: 975 }],
};

async function openDashboard(page, { balance, scheduleResponse = { status: 200, body: schedule } }) {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/v1", "");
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/merchants/settlement/schedule") return json(scheduleResponse.body, scheduleResponse.status);
    if (path === "/merchants/balance") return json(balance);
    if (path === "/stores") return json([store]);
    if (path.endsWith("/visual-studio")) return json({ proposals: [], versions: [] });
    if (path === "/merchants/kyc") return json({ status: "APPROVED" });
    if (path === "/merchants/invoicing_profile") return json({ status: "NOT_CONFIGURED" });
    if (path === "/merchants/international_payments") return json({ status: "OFF", settlementMode: "AGGREGATOR", feeBps: 590, fxRateAvailable: true, usdPayoutAccountOnFile: false, note: null });
    if (path.startsWith("/dashboard/terms")) return json({ current: null, upcoming: null, acceptedVersion: null, needsAcceptance: false });
    if (path.startsWith("/dashboard/limits")) return json({ level: 1, levelName: "Persona", liveEnabled: true, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, used: 0, month: "2026-10", resetsAt: "2026-11-01T04:00:00.000Z" });
    if (path === "/merchants/finances") return json({ totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" });
    return json([]);
  });
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
}

test("balance cards show pending and reserve, and the payouts page explains the timing", async ({ page }) => {
  await openDashboard(page, {
    balance: { payableBalance: 8_775, currency: "BOB", payoutsHeld: false, balances: [{ currency: "BOB", payableBalance: 8_775, available: 8_775, pending: 19_500, reserve: 975, nextPayoutAt: null }] },
  });
  const card = page.locator('#balanceCards .overview-balance[data-currency="BOB"]');
  await expect(card).toContainText("87.75 BOB");
  await expect(card).toContainText("En espera 195.00 BOB · Reserva 9.75 BOB");
  await expect(page.locator("#payoutHoldBanner")).toBeHidden();

  await page.goto("/#dashboard-payouts");
  await expect(page.locator("#settlementPolicy")).toHaveText("Nivel 1: tus ventas están disponibles a los 7 días; guardamos el 10% por 60 días como reserva de protección.");
  await expect(page.locator("#settlementReleases li")).toHaveCount(2);
  await expect(page.locator("#settlementReleases li").first()).toContainText("08/10/2026");
  await expect(page.locator("#settlementNextLevel")).toHaveText("En el nivel 2 (Negocio) recibes tu dinero a los 3 días y con 5% de reserva.");
});

test("a held account shows the pause banner", async ({ page }) => {
  await openDashboard(page, { balance: { payableBalance: 100, currency: "BOB", payoutsHeld: true, balances: [{ currency: "BOB", payableBalance: 100, available: 100, pending: 0, reserve: 0, nextPayoutAt: null }] } });
  await expect(page.locator("#payoutHoldBanner")).toBeVisible();
  await expect(page.locator("#payoutHoldBanner")).toHaveText("Tus pagos están en pausa. Escríbenos a soporte.");
});

test("an old-shape balance and a failing schedule still render the card, without the panel", async ({ page }) => {
  await openDashboard(page, { balance: { payableBalance: 5_000 }, scheduleResponse: { status: 500, body: { message: "boom" } } });
  await expect(page.locator("#balanceCards")).toContainText("Saldo por desembolsar (BOB)");
  await expect(page.locator("#balanceCards")).toContainText("50.00 BOB");
  await page.goto("/#dashboard-payouts");
  await expect(page.locator("#settlementPanel")).toBeHidden();
});
