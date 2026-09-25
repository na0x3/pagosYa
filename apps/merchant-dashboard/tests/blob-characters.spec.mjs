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

for (const width of [390, 1280]) test(`the profile editor shows your blob, offers three more and saves "Otra variación" at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await openDashboard(page);
  await expect(page.locator("#profileTriggerAvatar svg.profile-blob")).toHaveAttribute("aria-hidden", "true");
  await page.locator("#profileMenuTrigger").click();
  const picture = page.locator("#profileMenuAvatar svg");
  await expect(picture).toHaveAttribute("role", "img");
  await expect(picture.locator("title")).toHaveText("Dueño");
  const options = page.locator("#profileAvatarOptions [data-profile-avatar]");
  await expect(options).toHaveCount(4);
  await expect(options.first()).toHaveAttribute("data-profile-avatar", "1");
  await expect(options.first()).toHaveAttribute("aria-pressed", "true");
  await expect(options.nth(1)).toHaveAttribute("aria-label", /^Variación \d+$/);
  await page.screenshot({ path: `${SHOTS}/profile-editor-${width}.png` });
  const before = await page.locator("#profileTriggerAvatar").innerHTML();
  await page.getByRole("button", { name: "Otra variación" }).click();
  await expect.poll(() => state.patches.length).toBe(1);
  const saved = state.patches[0].profileAvatarId;
  expect(Number.isInteger(saved) && saved >= 1 && saved <= 999 && saved !== 1).toBe(true);
  expect(state.patches[0]).toMatchObject({ id: "session_current", profileName: "Dueño" });
  await expect(page.locator(`#profileAvatarOptions [data-profile-avatar="${saved}"]`)).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("#profileTriggerAvatar").innerHTML()).not.toBe(before);
  expect(await page.evaluate(() => localStorage.getItem("pagosya_merchant_avatar:merchant@example.com"))).toBe(String(saved));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("an old animal avatar id is kept as that blob variation; a broken stored value never breaks the picture", async ({ page }) => {
  const state = await openDashboard(page, { sessions: [session({ profileAvatarId: 3 })], localAvatar: "not-a-number" });
  await page.locator("#profileMenuTrigger").click();
  await expect(page.locator('#profileAvatarOptions [data-profile-avatar="3"]')).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("pagosya_merchant_avatar:merchant@example.com"))).toBe("3");
  expect(state.patches).toEqual([]);
});

test("a profile with no name is still named: the picture falls back to the name from the email", async ({ page }) => {
  await openDashboard(page, { sessions: [session({ profileName: "" })] });
  await page.locator("#profileMenuTrigger").click();
  await expect(page.locator("#profileMenuAvatar svg title")).toHaveText("Merchant");
});

test("without a seed from the API the picture keeps its place and its name, and nothing breaks", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openDashboard(page, { blobSeed: null });
  await page.locator("#profileMenuTrigger").click();
  await expect(page.locator("#profileMenuAvatar .blob-avatar-pending")).toHaveAttribute("aria-label", "Dueño");
  await expect(page.locator("#profileAvatarOptions [data-profile-avatar]")).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("a full profile menu (three sessions and an open edit form) renders only static blobs, each on a plate", async ({ page }) => {
  await openDashboard(page, { sessions: [
    session(),
    session({ id: "s2", profileName: "Ana", profileAvatarId: 3, isPrimary: false, current: false }),
    session({ id: "s3", profileName: "Luis", profileAvatarId: 998, isPrimary: false, current: false }),
  ] });
  await page.locator("#profileMenuTrigger").click();
  await page.locator('[data-edit-session="s2"]').click();
  await expect(page.locator('[data-session-edit-form="s2"] [data-edit-avatar]')).toHaveCount(4);
  await expect(page.locator('[data-session-edit-form="s2"] [data-edit-avatar="3"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#profileMenu svg.blob-figure")).toHaveCount(12);
  expect(await page.locator("#profileMenu .mo-root").count()).toBe(0);
  expect(await page.locator("#profileMenu svg.blob-figure:not(:has(.blob-plate))").count()).toBe(0);
});

test("a successful save keeps its new variation even when the refresh after it fails, and shows no avatar error", async ({ page }) => {
  const state = await openDashboard(page);
  let failNextSessionsGet = false;
  await page.route("http://localhost:3001/v1/dashboard/sessions", async (route) => {
    if (route.request().method() !== "GET" || !failNextSessionsGet) return route.fallback();
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "boom" }) });
  });
  await page.locator("#profileMenuTrigger").click();
  await expect(page.locator("#profileAvatarOptions [data-profile-avatar]")).toHaveCount(4);
  failNextSessionsGet = true;
  const before = await page.locator("#profileTriggerAvatar").innerHTML();
  await page.getByRole("button", { name: "Otra variación" }).click();
  await expect.poll(() => state.patches.length).toBe(1);
  const saved = state.patches[0].profileAvatarId;
  await expect(page.locator(`#profileAvatarOptions [data-profile-avatar="${saved}"]`)).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("#profileTriggerAvatar").innerHTML()).not.toBe(before);
  expect(await page.evaluate(() => localStorage.getItem("pagosya_merchant_avatar:merchant@example.com"))).toBe(String(saved));
  expect(await page.locator(".profile-session-state", { hasText: "No pudimos guardar el avatar" }).count()).toBe(0);
});

test("a rejected save rolls back to the previous variation and shows the error", async ({ page }) => {
  const state = await openDashboard(page);
  await page.locator("#profileMenuTrigger").click();
  await expect(page.locator("#profileAvatarOptions [data-profile-avatar]")).toHaveCount(4);
  await page.route("http://localhost:3001/v1/dashboard/sessions/session_current", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "No se pudo guardar" }) });
  });
  const before = await page.locator("#profileTriggerAvatar").innerHTML();
  await page.getByRole("button", { name: "Otra variación" }).click();
  await expect(page.locator(".profile-session-state", { hasText: "No pudimos guardar el avatar" })).toBeVisible();
  await expect(page.locator('#profileAvatarOptions [data-profile-avatar="1"]')).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("#profileTriggerAvatar").innerHTML()).toBe(before);
  expect(await page.evaluate(() => localStorage.getItem("pagosya_merchant_avatar:merchant@example.com"))).toBe("1");
  expect(state.patches).toEqual([]);
});

test('rapid double-clicks on "Otra variación" send only one PATCH while a save is pending', async ({ page }) => {
  const state = await openDashboard(page);
  await page.locator("#profileMenuTrigger").click();
  await expect(page.locator("#profileAvatarOptions [data-profile-avatar]")).toHaveCount(4);
  await page.evaluate(() => {
    const button = document.getElementById("profileAvatarShuffle");
    button.click();
    button.click();
  });
  await expect.poll(() => state.patches.length).toBe(1);
  await page.waitForTimeout(200);
  expect(state.patches.length).toBe(1);
});
