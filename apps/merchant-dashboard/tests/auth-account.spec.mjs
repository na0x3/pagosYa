import { expect, test } from "@playwright/test";

const store = {
  id: "store_1",
  merchantId: "merchant_1",
  slug: "tienda-demo",
  name: "Tienda demo",
  status: "ACTIVE",
  backgroundColor: "#f8fafc",
  backgroundMode: "solid",
  backgroundGradientStart: "#f8fafc",
  backgroundGradientEnd: "#e0e7ff",
  backgroundGradientAngle: 135,
  heroSlides: [],
  contentOrder: ["hero", "about", "gallery", "products", "links"],
  experienceStyle: "coverflow",
  motionDuoEnabled: false,
  motionExperience: "coverflow-carousel",
  editorialGallery: [],
  links: [],
  checkoutMode: "payment",
  cartRecommendationsEnabled: true,
  cartRecommendationProductIds: [],
  showLowStockToCustomers: false,
};

async function mockDashboardApi(page, customResponse) {
  const requests = [];
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const contentType = request.headers()["content-type"] || "";
    requests.push({ path, method: request.method(), body: contentType.includes("application/json") ? request.postDataJSON() : undefined });
    const custom = await customResponse?.({ path, request });
    let body = custom;
    if (body === undefined) {
      if (path === "/stores") body = [store];
      else if (path === "/merchants/balance") body = { payableBalance: 0 };
      else if (path === "/merchants/kyc") body = { status: "APPROVED" };
      else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
      else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
      else if (path === "/dashboard/sessions") body = {
        limit: 3,
        active: 1,
        currentSessionId: "session_current",
        canManageSessions: true,
        sessions: [{ id: "session_current", profileName: "Dueño", profileAvatarId: 1, isPrimary: true, current: true, createdAt: "2026-08-21T12:00:00.000Z", expiresAt: "2026-08-22T12:00:00.000Z" }],
      };
      else if (path === "/auth/google") body = { enabled: false, clientId: null };
      else body = [];
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  return requests;
}

test("merchant can sign in with a configured Google account", async ({ page }) => {
  await page.route("https://accounts.google.com/gsi/client", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.google={accounts:{id:{initialize(options){window.googleCallback=options.callback},renderButton(element){const button=document.createElement('button');button.type='button';button.textContent='Continuar con Google';button.id='fakeGoogleButton';button.onclick=()=>window.googleCallback({credential:'google-id-token'});element.appendChild(button)}}}};`,
  }));
  let selectedProfile = { profileName: "Dueño", profileAvatarId: 1 };
  const requests = await mockDashboardApi(page, ({ path, request }) => {
    if (path === "/auth/google") return { enabled: true, clientId: "google-client-id.apps.googleusercontent.com" };
    if (path === "/dashboard/google") return { token: "dash_google", user: { email: "owner@gmail.com" }, merchant: { id: "merchant_1" } };
    if (path === "/dashboard/sessions" && request.method() === "GET") return {
      limit: 3,
      active: 1,
      currentSessionId: "session_current",
      canManageSessions: true,
      sessions: [{ id: "session_current", ...selectedProfile, isPrimary: true, current: true, createdAt: "2026-08-21T12:00:00.000Z", expiresAt: "2026-08-22T12:00:00.000Z" }],
    };
    if (path === "/dashboard/sessions/session_current" && request.method() === "PATCH") {
      selectedProfile = request.postDataJSON();
      return { session: { id: "session_current", ...selectedProfile, isPrimary: true } };
    }
  });

  await page.goto("/");
  await page.locator("#fakeGoogleButton").click();

  await expect(page.locator("#sessionProfileDialog")).toBeVisible();
  await page.locator("#sessionProfileName").fill("María");
  await page.locator('[data-login-avatar="3"]').click();
  await page.locator("#sessionProfileContinue").click();
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#profileMenuTrigger")).toBeVisible();
  await expect(page.locator("#logout")).not.toBeVisible();
  await page.locator("#onboardingDialog").waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await page.locator("#onboardingDialog[open]").count()) await page.locator("#onboardingDialog").evaluate((dialog) => dialog.close());
  await page.locator("#profileMenuTrigger").click();
  await expect(page.locator("#profileMenu")).toBeVisible();
  await expect(page.locator("#loggedInAs")).toContainText("owner@gmail.com");
  await expect(page.locator("#profileSessionCount")).toHaveText("1 / 3");
  await expect(page.locator("#profileDisplayName")).toHaveText("María");
  await expect(page.locator('[data-profile-avatar="1"] img')).toHaveAttribute("src", "/assets/profile-1.png");
  await page.locator('[data-profile-avatar="4"]').click();
  expect(await page.evaluate(() => localStorage.getItem("pagosya_merchant_avatar:owner@gmail.com"))).toBe("4");
  await page.locator("#moneyVisibilityToggle").click();
  await expect(page.locator("#moneyVisibilityLabel")).toHaveText("Mostrar montos");
  expect(requests).toContainEqual({ path: "/dashboard/google", method: "POST", body: { credential: "google-id-token" } });
  expect(requests).toContainEqual({ path: "/dashboard/sessions/session_current", method: "PATCH", body: { profileName: "María", profileAvatarId: 3 } });
  expect(await page.evaluate(() => sessionStorage.getItem("pagosya_merchant_session"))).toBe("dash_google");
});

test("merchant deletion requires typed confirmation and clears the session", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "owner@example.com");
  });
  const requests = await mockDashboardApi(page, ({ path, request }) => {
    if (path === "/dashboard/account" && request.method() === "DELETE") return { deactivated: true, merchantSuspended: true };
  });

  await page.goto("/");
  await page.locator("#onboardingDialog").waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await page.locator("#onboardingDialog[open]").count()) {
    await page.locator("#onboardingDialog").evaluate((dialog) => dialog.close());
  }
  await page.locator("#profileMenuTrigger").click();
  await page.locator("#deleteMerchantAccount").click();
  await expect(page.locator("#merchantDeleteDialog")).toBeVisible();
  await expect(page.locator("#merchantDeleteConfirm")).toBeDisabled();
  await page.locator("#merchantDeleteConfirmation").fill("ELIMINAR");
  await page.locator("#merchantDeleteConfirm").click();

  await expect(page.locator("#loginForm")).toBeVisible();
  await expect(page.locator("#info")).toContainText("tiendas fueron archivadas");
  expect(requests).toContainEqual({ path: "/dashboard/account", method: "DELETE", body: { confirmation: "ELIMINAR" } });
  expect(await page.evaluate(() => sessionStorage.getItem("pagosya_merchant_session"))).toBeNull();
});

test("profile menu can close another active session", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "owner@example.com");
  });
  const requests = await mockDashboardApi(page, ({ path, request }) => {
    if (path === "/dashboard/sessions" && request.method() === "GET") {
      return {
        limit: 3,
        active: 2,
        currentSessionId: "session_current",
        canManageSessions: true,
        sessions: [
          { id: "session_current", profileName: "Dueño", profileAvatarId: 1, isPrimary: true, current: true, createdAt: "2026-08-21T02:15:00.000Z", expiresAt: "2026-08-22T02:15:00.000Z" },
          { id: "session_other", profileName: "Ana", profileAvatarId: 3, isPrimary: false, current: false, createdAt: "2026-08-20T16:30:00.000Z", expiresAt: "2026-08-21T16:30:00.000Z" },
        ],
      };
    }
    if (path === "/dashboard/sessions/session_other" && request.method() === "DELETE") return { revoked: true, current: false };
  });

  await page.goto("/");
  await page.locator("#onboardingDialog").waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await page.locator("dialog[open]").count()) await page.locator("dialog[open]").evaluate((dialog) => dialog.close());
  await page.locator("#profileMenuTrigger").click();
  await expect(page.locator("#profileSessionCount")).toHaveText("2 / 3");
  await expect(page.locator(".profile-session-current")).toHaveText("Esta sesión");
  await page.locator('[data-revoke-session="session_other"]').click();

  await expect.poll(() => requests.some((entry) => entry.path === "/dashboard/sessions/session_other" && entry.method === "DELETE")).toBe(true);
});

test("main session can rename another logged-in profile", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_main");
    sessionStorage.setItem("pagosya_merchant_email", "owner@example.com");
  });
  let otherProfile = { profileName: "Invitado", profileAvatarId: 2 };
  const requests = await mockDashboardApi(page, ({ path, request }) => {
    if (path === "/dashboard/sessions" && request.method() === "GET") return {
      limit: 3,
      active: 2,
      currentSessionId: "session_main",
      canManageSessions: true,
      sessions: [
        { id: "session_main", profileName: "Dueño", profileAvatarId: 1, isPrimary: true, current: true, createdAt: "2026-08-21T02:15:00.000Z", expiresAt: "2026-08-22T02:15:00.000Z" },
        { id: "session_other", ...otherProfile, isPrimary: false, current: false, createdAt: "2026-08-20T16:30:00.000Z", expiresAt: "2026-08-21T16:30:00.000Z" },
      ],
    };
    if (path === "/dashboard/sessions/session_other" && request.method() === "PATCH") {
      otherProfile = request.postDataJSON();
      return { session: { id: "session_other", ...otherProfile, isPrimary: false } };
    }
  });

  await page.goto("/");
  await page.locator("#onboardingDialog").waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await page.locator("dialog[open]").count()) await page.locator("dialog[open]").evaluate((dialog) => dialog.close());
  await page.locator("#profileMenuTrigger").click();
  await page.locator('[data-edit-session="session_other"]').click();
  await page.locator('[data-session-edit-form="session_other"] input[name="profileName"]').fill("Carlos");
  await page.locator('[data-session-edit-form="session_other"] [data-edit-avatar="4"]').click();
  await page.locator('[data-session-edit-form="session_other"] button[type="submit"]').click();

  await expect(page.locator(".profile-session-row", { hasText: "Carlos" })).toBeVisible();
  expect(requests).toContainEqual({ path: "/dashboard/sessions/session_other", method: "PATCH", body: { profileName: "Carlos", profileAvatarId: 4 } });
});
