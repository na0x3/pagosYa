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
  experienceStyle: "editorial-grid",
  motionDuoEnabled: false,
  motionExperience: "hero-carousel",
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

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`remembered Appearance leaves sign-in reachable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem("pagosya_dashboard_view", "appearance"));
    await mockDashboardApi(page);
    await page.goto("/");
    await expect(page.locator("body")).toHaveClass(/is-logged-out/);
    await expect(page.locator("body")).not.toHaveClass(/store-preview-fullscreen/);
    await expect(page.locator(".store-preview-panel")).toBeHidden();
    await page.locator("#loginForm").getByLabel("Correo", { exact: true }).fill("fixture@example.com");
    await page.locator("#loginForm").getByLabel("Contraseña", { exact: true }).fill("fixture-password");
    await page.getByRole("button", { name: "Continuar", exact: true }).click({ trial: true });
  });
}

// ISO M-09: an account with codes on gets the code field after a right password, and the same sign-in carries the code.
test("sign-in asks for the verification code when the account has it on", async ({ page }) => {
  await mockDashboardApi(page);
  const requests = [];
  await page.route("http://localhost:3001/v1/dashboard/login", async (route) => {
    const body = route.request().postDataJSON();
    requests.push({ path: "/dashboard/login", body });
    if (!body.code) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "mfa_required", message: "Escribe el código de 6 dígitos de tu app de verificación" }) });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ token: "dash_ok", expiresAt: "2099-01-01T00:00:00.000Z", merchant: { id: "merchant_1" }, user: { email: body.email } }) });
  });
  await page.goto("/");
  await expect(page.locator("#loginCodeRow")).toBeHidden();
  await page.locator("#loginForm").getByLabel("Correo", { exact: true }).fill("owner@tienda.bo");
  await page.locator("#loginForm").getByLabel("Contraseña", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.locator("#loginCodeRow")).toBeVisible();
  await expect(page.locator("#error")).toHaveText("");
  await page.locator("#loginCode").fill("123456");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/is-logged-out/);
  const logins = requests.filter((r) => r.path === "/dashboard/login").map((r) => r.body);
  expect(logins).toEqual([{ email: "owner@tienda.bo", password: "correct-password" }, { email: "owner@tienda.bo", password: "correct-password", code: "123456" }]);
});

test("an expired session returns to sign-in", async ({ page }) => {
  await page.addInitScript(() => {
    if (window !== window.top) return; // sandboxed email previews cannot read storage
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "fixture@example.com");
  });
  await mockDashboardApi(page);
  let expired = false;
  await page.route("http://localhost:3001/v1/stores", (route) => route.fulfill({
    status: expired ? 401 : 200,
    contentType: "application/json",
    body: JSON.stringify(expired ? { message: "Tu sesión venció. Vuelve a iniciar sesión." } : [store]),
  }));
  // The #dashboard-settings view no longer exists (see 3b66e2f); the sidebar
  // picker is the dashboard's own signal that the store list has loaded.
  await page.goto("/#dashboard-stores");
  await expect(page.locator("#sidebarStorePicker")).toContainText(store.name);
  expired = true;
  await page.evaluate(() => window.refresh());
  await expect(page.locator("body")).toHaveClass(/is-logged-out/);
  await expect(page.locator("#storeSettingsPage")).toBeHidden();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar", exact: true }).click({ trial: true });
  await expect(page.locator("#error")).toContainText("sesión venció");
});

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
      // One owner per account (2026-10-22): the last real name the account used, never a «who is signing in» question.
      profiles: [{ profileName: "María José" }],
      sessions: [{ id: "session_current", ...selectedProfile, isPrimary: true, current: true, createdAt: "2026-08-21T12:00:00.000Z", expiresAt: "2026-08-22T12:00:00.000Z" }],
    };
    if (path === "/dashboard/sessions/session_current" && request.method() === "PATCH") {
      selectedProfile = request.postDataJSON();
      return { session: { id: "session_current", ...selectedProfile, isPrimary: true } };
    }
  });

  await page.goto("/");
  await page.locator("#fakeGoogleButton").click();

  await expect(page.locator("#sessionProfileDialog")).toHaveCount(0);
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#profileMenuTrigger")).toBeVisible();
  await expect(page.locator("#logout")).not.toBeVisible();
  await page.locator("#profileMenuTrigger").click();
  await expect(page.locator("#profileMenu")).toBeVisible();
  await expect(page.locator("#loggedInAs")).toContainText("owner@gmail.com");
  await expect(page.locator("#profileSessions")).toHaveText("Abierta solo en este dispositivo");
  await expect(page.locator("#profileDisplayName")).toHaveText("María José");
  await expect(page.locator("#profileTriggerAvatar")).toHaveText("MJ");
  await expect(page.locator("#profileMenuAvatar")).toHaveText("MJ");
  await expect(page.locator("#profileMenu [data-profile-avatar], #profileMenu svg.blob, #profileMenu .profile-blob")).toHaveCount(0);
  await page.locator("#moneyVisibilityToggle").click();
  await expect(page.locator("#moneyVisibilityLabel")).toHaveText("Mostrar montos");
  expect(requests).toContainEqual({ path: "/dashboard/google", method: "POST", body: { credential: "google-id-token" } });
  expect(requests.some((entry) => entry.method === "PATCH")).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem("pagosya_merchant_session"))).toBe("dash_google");
});

test("merchant deletion requires typed confirmation and clears the session", async ({ page }) => {
  await page.addInitScript(() => {
    if (window !== window.top) return; // sandboxed email previews cannot read storage
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "owner@example.com");
  });
  const requests = await mockDashboardApi(page, ({ path, request }) => {
    if (path === "/dashboard/account" && request.method() === "DELETE") return { deactivated: true, merchantSuspended: true };
  });

  await page.goto("/");
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

test("profile menu closes the owner's other devices", async ({ page }) => {
  await page.addInitScript(() => {
    if (window !== window.top) return; // sandboxed email previews cannot read storage
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
  if (await page.locator("dialog[open]").count()) await page.locator("dialog[open]").evaluate((dialog) => dialog.close());
  await page.locator("#profileMenuTrigger").click();
  await expect(page.locator("#profileSessions")).toContainText("Abierta en 2 dispositivos");
  await expect(page.locator("#profileMenu")).not.toContainText("Ana");
  await page.locator("[data-close-other-sessions]").click();

  await expect.poll(() => requests.some((entry) => entry.path === "/dashboard/sessions/session_other" && entry.method === "DELETE")).toBe(true);
});

test("design mode: the Studio's design-focus covers the dashboard and never outlives the session", async ({ page }) => {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "owner@example.com");
  });
  await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
  const post = (data) => page.evaluate((payload) => {
    const frame = document.getElementById("merchantStudioFrame");
    window.dispatchEvent(new MessageEvent("message", { data: payload, origin: location.origin, source: frame.contentWindow }));
  }, data);
  await post({ type: "pagosya:design-focus", open: true });
  await expect(page.locator("body")).toHaveClass(/design-focus/);
  await post({ type: "pagosya:session-expired" });
  await expect(page.locator("body")).not.toHaveClass(/design-focus/);
});

