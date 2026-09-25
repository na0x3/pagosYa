import { expect, test } from "@playwright/test";

// Login and route-mocking setup mirror merchant-levels.spec.mjs, plus the /dashboard/rewards endpoints.
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

const segments = ["STICKER_COMMON", "XP_25", "AI_CREDITS_5", "TIP", "XP_50", "RESPIN", "STICKER_RARE", "XP_200", "AI_CREDITS_25"];
const rewards = (overrides = {}) => ({
  wheel: { available: true, day: "2026-09-24", spinsUsed: 0, spinsAllowed: 1, segments },
  board: { position: 0, rollsUsed: 0, rollsAvailable: 0, salesUntilNextRoll: 10, lapsCompleted: 0, tiles: Array(24).fill("STICKER_COMMON") },
  bonusXp: 0, stickers: [], aiCreditBalance: 0, aiCreditsThisMonth: 0, aiCreditMonthlyCap: 50, ...overrides,
});

async function openDashboard(page, options, hash = "") {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/dashboard/daily-login-reward") return json({ awarded: false, totalStars: 1, wheelAvailable: options.wheelAvailable });
    if (path === "/dashboard/rewards") return json(options.currentRewards);
    if (path === "/dashboard/rewards/wheel/spin") {
      if (options.spinResponse) return json(options.spinResponse.json, options.spinResponse.status);
      options.currentRewards = { ...options.currentRewards, bonusXp: options.currentRewards.bonusXp + 50, wheel: { ...options.currentRewards.wheel, available: false, spinsUsed: 1 } };
      return json({ segmentIndex: 4, grant: { id: "g1", prize: "XP_50", kind: "XP", amount: 50, convertedFrom: null, sticker: null, tip: null }, wheel: options.currentRewards.wheel });
    }
    if (path === "/dashboard/rewards/board/roll") {
      options.currentRewards = { ...options.currentRewards, board: options.rollResponse.json.board };
      return json(options.rollResponse.json);
    }
    if (path.startsWith("/dashboard/limits")) return json({ level: 1, levelName: "Persona", liveEnabled: true, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, used: 0, month: "2026-09", resetsAt: "2026-10-01T04:00:00.000Z" });
    if (path.startsWith("/dashboard/terms")) return json({ current: null, upcoming: null, acceptedVersion: null, needsAcceptance: false });
    let body = {};
    if (path === "/stores") body = [store];
    else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
    else if (path === "/merchants/kyc") body = { status: "APPROVED" };
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
      body = { totalRevenue: 0, paymentCount: 1, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
    return json(body);
  });
  await page.goto(`/${hash}`);
  await expect(page.locator("#app")).toBeVisible();
}

test("opens the wheel on the first login of the day and animates the XP bar on a win", async ({ page }) => {
  await openDashboard(page, { wheelAvailable: true, currentRewards: rewards() });
  const modal = page.locator("#luckWheelModal");
  await expect(modal).toBeVisible();
  await modal.locator("#luckWheelSpin").click();
  await expect(modal.locator("#luckWheelResult")).toContainText("+50 XP", { timeout: 8000 });
  await expect(page.locator("#xpGainAnnouncer")).toHaveText(/Ganaste 50 XP/, { timeout: 4000 });
  await expect(page.locator("#topbarXpTrack")).toHaveClass(/is-xp-pulse/, { timeout: 4000 });
});

test("does not open the wheel when today's spin is used", async ({ page }) => {
  await openDashboard(page, { wheelAvailable: false, currentRewards: rewards({ wheel: { available: false, day: "2026-09-24", spinsUsed: 1, spinsAllowed: 1, segments } }) });
  await page.waitForTimeout(800);
  await expect(page.locator("#luckWheelModal")).toBeHidden();
});

test("an API error leaves the wheel still and explains why", async ({ page }) => {
  await openDashboard(page, { wheelAvailable: true, currentRewards: rewards(), spinResponse: { status: 409, json: { message: "Ya usaste tu giro de hoy." } } });
  const modal = page.locator("#luckWheelModal");
  await expect(modal).toBeVisible();
  const before = await page.locator("#luckWheelDisc").evaluate((el) => el.style.transform);
  await modal.locator("#luckWheelSpin").click();
  await expect(modal.locator("#luckWheelStatus")).toContainText("Ya usaste tu giro de hoy.");
  expect(await page.locator("#luckWheelDisc").evaluate((el) => el.style.transform)).toBe(before);
});

test("a malformed rewards response degrades to an explanation instead of breaking the dashboard", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openDashboard(page, { wheelAvailable: true, currentRewards: {} });
  await page.evaluate(() => window.setDashboardView("progress"));
  await expect(page.locator("#luckWheelStatus")).toContainText("No pudimos cargar la ruleta");
  await expect(page.locator("#luckWheelModal")).toBeHidden();
  expect(errors).toEqual([]);
});

test("the companion hops along the Horizonte board and the prize is shown", async ({ page }) => {
  const tiles = Array(24).fill("STICKER_COMMON"); tiles[3] = "AI_CREDITS_5";
  const usedWheel = { available: false, day: "2026-09-24", spinsUsed: 1, spinsAllowed: 1, segments };
  await openDashboard(page, {
    wheelAvailable: false,
    currentRewards: rewards({ wheel: usedWheel, board: { position: 0, rollsUsed: 0, rollsAvailable: 1, salesUntilNextRoll: 4, lapsCompleted: 0, tiles } }),
    rollResponse: { json: { die: 3, from: 0, to: 3, lapCompleted: false, grant: { id: "g2", prize: "AI_CREDITS_5", kind: "AI_CREDITS", amount: 5, convertedFrom: null, sticker: null, tip: null }, board: { position: 3, rollsUsed: 1, rollsAvailable: 0, salesUntilNextRoll: 4, lapsCompleted: 0, tiles } } },
  });
  await expect(page.locator("#rewardsBoardModal")).toBeVisible();
  await expect(page.locator("#rewardsBoard .board-tile")).toHaveCount(24);
  await expect(page.locator("#rewardsBoardRoll")).toHaveText(/Tirar dado \(1\)/);
  await page.locator("#rewardsBoardRoll").click();
  await expect(page.locator("#rewardsBoardToken")).toHaveAttribute("data-tile", "3", { timeout: 4000 });
  await expect(page.locator("#rewardsBoardResult")).toContainText("5 créditos de IA");
  await expect(page.locator("#rewardsBoardRoll")).toBeDisabled();
  await expect(page.locator("#rewardsBoardHint")).toContainText("4 ventas");
});

test("on a phone the wheel modal sits above the sidebar and the YAPI dock", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openDashboard(page, { wheelAvailable: true, currentRewards: rewards() });
  await expect(page.locator("#luckWheelModal")).toBeVisible();
  const covered = await page.evaluate(() => {
    const card = document.querySelector(".luck-wheel-modal-card");
    const box = card.getBoundingClientRect();
    const bottom = Math.min(box.bottom, window.innerHeight) - 12;
    const probes = { leftEdge: [box.left + 8, box.top + box.height / 2], bottomCenter: [box.left + box.width / 2, bottom], topLeft: [box.left + 8, box.top + 8] };
    // Transient layers (achievement toast, confetti) are meant to sit above the modal; persistent chrome is not.
    const transient = (element) => !!element?.closest(".gamification-toast, .confetti-layer, [id^='gamificationToast']");
    return Object.entries(probes).filter(([, [x, y]]) => { const hit = document.elementFromPoint(x, y); return !card.contains(hit) && !transient(hit); }).map(([name]) => name);
  });
  expect(covered).toEqual([]);
});

const usedWheelState = { available: false, day: "2026-09-24", spinsUsed: 1, spinsAllowed: 1, segments };
const boardWith = (rollsAvailable) => ({ position: 0, rollsUsed: 0, rollsAvailable, salesUntilNextRoll: 10, lapsCompleted: 0, tiles: Array(24).fill("STICKER_COMMON") });

test("the board is not on the progress page and pops up when 10 sales earn a roll", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const options = { wheelAvailable: false, currentRewards: rewards({ wheel: usedWheelState, board: boardWith(0) }) };
  await openDashboard(page, options);
  await page.evaluate(() => window.setDashboardView("progress"));
  await expect(page.locator("#animalAdventure")).toHaveCount(0);
  await expect(page.locator("#luckWheel")).toBeVisible();
  await expect(page.locator("#rewardsBoard")).toBeHidden();
  // A background refresh sees the 10th sale's roll and pops the board.
  options.currentRewards = rewards({ wheel: usedWheelState, board: boardWith(1) });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator("#rewardsBoardModal")).toBeVisible();
  await expect(page.locator("#rewardsBoardKicker")).toContainText("10 ventas");
  // Dismissing it keeps it closed until another roll is earned.
  await page.locator("#rewardsBoardModalClose").click();
  await expect(page.locator("#rewardsBoardModal")).toBeHidden();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(500);
  await expect(page.locator("#rewardsBoardModal")).toBeHidden();
  options.currentRewards = rewards({ wheel: usedWheelState, board: boardWith(2) });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator("#rewardsBoardModal")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a roll earned while logged out pops the board after the daily wheel on login", async ({ page }) => {
  await openDashboard(page, { wheelAvailable: true, currentRewards: rewards({ board: boardWith(1) }) });
  await expect(page.locator("#luckWheelModal")).toBeVisible();
  await expect(page.locator("#rewardsBoardModal")).toBeHidden();
  await page.locator("#luckWheelModalClose").click();
  await expect(page.locator("#rewardsBoardModal")).toBeVisible();
});

test("on a phone the board's center content stays inside the ring of tiles", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openDashboard(page, { wheelAvailable: false, currentRewards: rewards({ wheel: usedWheelState, board: boardWith(1) }) });
  await expect(page.locator("#rewardsBoardModal")).toBeVisible();
  await expect(page.locator("#rewardsBoard .board-tile")).toHaveCount(24);
  const overlaps = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll("#rewardsBoard .board-tile")].map((tile) => tile.getBoundingClientRect());
    const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    return [...document.querySelectorAll(".rewards-board-center > *:not([hidden])")]
      .filter((element) => tiles.some((tile) => hit(element.getBoundingClientRect(), tile)))
      .map((element) => element.id || element.tagName);
  });
  expect(overlaps).toEqual([]);
});
