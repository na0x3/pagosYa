import { expect, test } from "@playwright/test";

const store = {
  id: "store_1", merchantId: "merchant_1", slug: "store_1", name: "Primera", websiteRevision: 0, websitePublishedRevision: 0, websiteDraft: null, status: "ACTIVE",
  backgroundColor: "#f8fafc", backgroundMode: "solid", backgroundGradientStart: "#f8fafc", backgroundGradientEnd: "#e0e7ff", backgroundGradientAngle: 135,
  heroSlides: [], contentOrder: ["hero", "about", "gallery", "products", "links"], experienceStyle: "editorial-grid", motionDuoEnabled: false,
  motionExperience: "clarity-marquee", motionExperiences: ["clarity-marquee"], animations: [], editorialGallery: [], links: [], customDomains: [],
  checkoutMode: "payment", contactPhone: null, contactEmail: null, contactFormEnabled: false, contactFormEmail: null, locationMapUrl: null,
  locationDescription: null, locationHighlight: null, locations: [], leadCaptureUrl: null, cartRecommendationsEnabled: true, cartRecommendationProductIds: [], showLowStockToCustomers: false,
};

const row = { id: "c1", number: "R-2026-000042", status: "WAITING_MERCHANT", category: "NOT_DELIVERED", receivedAt: "2026-10-08T19:00:00.000Z", merchantDueAt: "2099-10-13T03:59:59.999Z", waitingOnYou: true, late: false };
const detail = (over = {}) => ({
  id: "c1", number: "R-2026-000042", status: "WAITING_MERCHANT", category: "NOT_DELIVERED", request: "REFUND",
  description: "Nunca llegó <b>mi pedido</b>.", buyerName: "Ana", receivedAt: "2026-10-08T19:00:00.000Z", merchantDueAt: "2099-10-13T03:59:59.999Z",
  payment: { id: "pi_1", amount: 5000, currency: "BOB", createdAt: "2026-10-01T15:00:00.000Z" },
  questions: [{ at: "2026-10-09T15:00:00.000Z", body: "¿Enviaste el pedido?" }], replies: [], buyerAttachments: [{ id: "a1", fileName: "caja.jpg", contentType: "image/jpeg", sizeBytes: 10 }],
  ...over,
});

async function openComplaints(page, { onReply } = {}) {
  let replied = false;
  const repliedDetail = detail({ status: "IN_REVIEW", replies: [{ at: "2026-10-10T15:00:00.000Z", body: "Lo enviamos el lunes por courier.", late: false, attachments: [] }] });
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/dashboard/complaints") return json([row]);
    if (path === "/dashboard/complaints/c1/reply" && request.method() === "POST") { onReply?.(request); replied = true; return json(repliedDetail); }
    if (path === "/dashboard/complaints/c1") return json(replied ? repliedDetail : detail());
    if (path === "/stores") return json([store]);
    if (path.endsWith("/visual-studio")) return json({ proposals: [], versions: [] });
    if (path === "/merchants/kyc") return json({ status: "APPROVED" });
    if (path === "/merchants/invoicing_profile") return json({ status: "NOT_CONFIGURED" });
    if (path === "/merchants/balance") return json({ payableBalance: 0, currency: "BOB", payoutsHeld: false, balances: [] });
    if (path === "/merchants/international_payments") return json({ status: "OFF", settlementMode: "AGGREGATOR", feeBps: 590, fxRateAvailable: true, usdPayoutAccountOnFile: false, note: null });
    if (path.startsWith("/dashboard/terms")) return json({ current: null, upcoming: null, acceptedVersion: null, needsAcceptance: false });
    if (path.startsWith("/dashboard/limits")) return json({ level: 1, levelName: "Persona", liveEnabled: true, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, used: 0, month: "2026-10", resetsAt: "2026-11-01T04:00:00.000Z" });
    if (path === "/merchants/finances") return json({ totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" });
    return json([]);
  });
  await page.goto("/#dashboard-complaints");
  await expect(page.locator("#app")).toBeVisible();
}

test("Reclamos lists what pagosYa asked, shows the buyer's text as text, and sends the merchant's reply", async ({ page }) => {
  const replies = [];
  const errors = [];
  // The dashboard's store-preview iframe reports sessionStorage access errors on every view (pre-existing); ignore only those.
  page.on("pageerror", (error) => { if (!/sessionStorage/.test(error.message)) errors.push(error.message); });
  await openComplaints(page, { onReply: (request) => replies.push(request.postData() ?? "") });
  const root = page.locator("#complaintsRoot");
  await expect(root).toContainText("R-2026-000042");
  await expect(root).toContainText("Esperando tu respuesta");
  await root.locator("[data-open=c1]").click();
  await expect(root).toContainText("Nunca llegó <b>mi pedido</b>.");
  await expect(root).toContainText("¿Enviaste el pedido?");
  await expect(root.locator("[data-file=a1]")).toHaveText("caja.jpg");
  await root.locator("textarea[name=body]").fill("Lo enviamos el lunes por courier.");
  await root.locator("#complaintReply button[type=submit]").click();
  await expect(root).toContainText("Tu respuesta (");
  await expect(root.locator("#complaintReply")).toHaveCount(0);
  expect(replies).toHaveLength(1);
  expect(replies[0]).toContain("Lo enviamos el lunes por courier.");
  expect(errors).toEqual([]);
});
