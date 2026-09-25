import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

// B1 blob characters. Login and route mocking mirror rewards.spec.mjs, plus /dashboard/sessions (with the API's
// blobSeed) and the progress-celebration endpoints. Screenshots land in tmp/blob-shots/ to be looked at.
const SHOTS = "../../tmp/blob-shots";
mkdirSync(SHOTS, { recursive: true });
const BLOB_SEED = "blobSeedTest0001";
const store = {
  id: "store_1", merchantId: "merchant_1", slug: "store_1", name: "Primera", websiteRevision: 0, websitePublishedRevision: 0, websiteDraft: null, status: "ACTIVE",
  backgroundColor: "#f8fafc", backgroundMode: "solid", backgroundGradientStart: "#f8fafc", backgroundGradientEnd: "#e0e7ff", backgroundGradientAngle: 135,
  heroSlides: [], contentOrder: ["hero", "about", "gallery", "products", "links"], experienceStyle: "editorial-grid", motionDuoEnabled: false,
  motionExperience: "clarity-marquee", motionExperiences: ["clarity-marquee"], animations: [], editorialGallery: [], links: [], customDomains: [],
  checkoutMode: "payment", contactPhone: null, contactEmail: null, contactFormEnabled: false, contactFormEmail: null, locationMapUrl: null,
  locationDescription: null, locationHighlight: null, locations: [], leadCaptureUrl: null, cartRecommendationsEnabled: true, cartRecommendationProductIds: [],
  showLowStockToCustomers: false,
};
const segments = ["STICKER_COMMON", "XP_25", "AI_CREDITS_5", "TIP", "XP_50", "RESPIN", "STICKER_RARE", "XP_200", "AI_CREDITS_25"];
const idleBoard = { position: 0, rollsUsed: 0, rollsAvailable: 0, salesUntilNextRoll: 10, lapsCompleted: 0, tiles: Array(24).fill("STICKER_COMMON") };
const rewardsState = (board = idleBoard) => ({
  wheel: { available: false, day: "2026-09-24", spinsUsed: 1, spinsAllowed: 1, segments },
  board, bonusXp: 0, stickers: [], aiCreditBalance: 0, aiCreditsThisMonth: 0, aiCreditMonthlyCap: 50,
});
const session = (overrides = {}) => ({ id: "session_current", profileName: "Dueño", profileAvatarId: 1, isPrimary: true, current: true, createdAt: "2026-09-25T12:00:00.000Z", expiresAt: "2026-09-26T12:00:00.000Z", ...overrides });

async function openDashboard(page, options = {}) {
  const state = { sessions: options.sessions ?? [session()], patches: [] };
  const blobSeed = "blobSeed" in options ? options.blobSeed : BLOB_SEED;
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  if (options.localAvatar !== undefined) await page.addInitScript((value) => localStorage.setItem("pagosya_merchant_avatar:merchant@example.com", value), options.localAvatar);
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/dashboard/sessions" && request.method() === "GET") {
      return json({ limit: 3, active: state.sessions.length, profiles: [], currentSessionId: "session_current", canManageSessions: true, ...(blobSeed ? { blobSeed } : {}), sessions: state.sessions });
    }
    if (path.startsWith("/dashboard/sessions/") && request.method() === "PATCH") {
      const id = path.split("/").pop();
      const body = request.postDataJSON();
      state.patches.push({ id, ...body });
      state.sessions = state.sessions.map((entry) => (entry.id === id ? { ...entry, ...body } : entry));
      return json({ session: { id, ...body, isPrimary: id === "session_current" } });
    }
    if (path === "/dashboard/daily-login-reward") return json({ awarded: false, totalStars: 1, wheelAvailable: false });
    if (path === "/dashboard/rewards") return json(options.rewards ?? rewardsState());
    if (path === "/dashboard/progress-celebrations") return json({ newlyUnlockedLevels: options.unlockLevels ?? [] });
    if (path === "/dashboard/progress-celebrations/acknowledge") return json({ acknowledged: true });
    if (path.startsWith("/dashboard/limits")) return json({ level: 1, levelName: "Persona", liveEnabled: true, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, used: 0, month: "2026-09", resetsAt: "2026-10-01T04:00:00.000Z" });
    if (path.startsWith("/dashboard/terms")) return json({ current: null, upcoming: null, acceptedVersion: null, needsAcceptance: false });
    let body = [];
    if (path === "/stores") body = [store];
    else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
    else if (path === "/merchants/kyc") body = { status: "APPROVED" };
    else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
    else if (path === "/merchants/balance") body = { payableBalance: 0, currency: "BOB", balances: [] };
    else if (path === "/merchants/international_payments") body = { status: "OFF", settlementMode: "AGGREGATOR", feeBps: 590, fxRateAvailable: true, usdPayoutAccountOnFile: false, note: null };
    else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: options.sales ?? 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
    return json(body);
  });
  await page.goto(options.hash ?? "/");
  await expect(page.locator("#app")).toBeVisible();
  return state;
}

test("the dashboard serves Blobatar and the blob module as browser modules, and nothing else from those folders", async ({ page }) => {
  await page.route("http://localhost:3001/v1/**", (route) => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.goto("/");
  const html = await page.evaluate(async () => (await import("/src/profile-blob.mjs")).profileBlobHtml({ blobSeed: "s", variation: 2, name: "Ana" }));
  expect(html).toContain("<title>Ana</title>");
  for (const path of ["/vendor/blobatar/react.js", "/vendor/blobatar/index.js", "/vendor/blob-characters/package.json", "/vendor/blob-characters/test/render.test.mjs"]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
  expect((await page.request.get("/vendor/blob-characters/blob-motion.css")).headers()["content-type"]).toContain("text/css");
});
