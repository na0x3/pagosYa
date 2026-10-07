import { expect, test } from "@playwright/test";

const store = (id, name) => ({
  id,
  merchantId: "merchant_1",
  slug: id,
  name,
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
});

async function openDashboard(page, stores, responseForRequest) {
  const requests = [];
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const contentType = request.headers()["content-type"] || "";
    requests.push({ path, method: request.method(), body: contentType.includes("application/json") ? request.postDataJSON() : undefined });
    const customBody = await responseForRequest?.({ path, request });
    let body = customBody ?? {};
    if (customBody === undefined) {
      if (path === "/stores") body = stores;
      else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
      else if (path === "/merchants/balance") body = { payableBalance: 0 };
      else if (path === "/merchants/kyc") body = { status: "APPROVED" };
      else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
      else if (path === "/merchants/payouts" || path === "/payment_intents" || path === "/merchants/orders" || path.includes("/categories") || path.includes("/payment_links") || path.includes("/operations/integrations") || path.includes("/promo-codes") || path.includes("/debt-collection-links") || path.endsWith("/domains")) body = [];
      else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
      else if (path.endsWith("/settings")) body = { ...request.postDataJSON(), websiteRevision: request.postDataJSON().revision + 1 };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#dashboard-stores");
  await expect(page.locator("#sidebarStorePicker")).toContainText(stores[0].name);
  return requests;
}

async function navigateDashboard(page, view) {
  const sidebar = page.locator(".dashboard-sidebar");
  const handle = page.locator("#storeFullscreenNavHandle");
  if (await handle.isVisible() && !(await sidebar.evaluate((element) => element.classList.contains("is-store-nav-pinned")))) await handle.click();
  const link = page.locator(`.dashboard-nav-button[data-dashboard-view="${view}"]`);
  await link.evaluate((element) => element.closest("details.dashboard-nav-group")?.setAttribute("open", ""));
  await link.click();
}

async function openSettings(page) {
  const requests = await openDashboard(page, [store("store_1", "Café Illimani")]);
  await navigateDashboard(page, "store-settings");
  await expect(page.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
  return requests;
}

test("Ajustes is one page with tabs, and General has no collapse buttons or repeated title", async ({ page }) => {
  await openSettings(page);
  await expect(page.getByRole("tab")).toHaveText(["General", "Marca", "Envíos y retiro", "Dominio", "Correos"]);
  const general = page.locator("#settingsPanelGeneral");
  await expect(general.getByRole("heading", { name: "Identidad" })).toBeVisible();
  await expect(page.locator("#storeSettingsSection").getByRole("button", { name: /^(Ocultar|Mostrar)/ })).toHaveCount(0);
  await expect(page.locator("#storeSettingsSection h2")).toHaveCount(0);
  await expect(page.locator("[data-settings-open]")).toHaveCount(0);
});

test("Guardar appears only once something changed", async ({ page }) => {
  await openSettings(page);
  const save = page.locator("#storeSettingsSave");
  await expect(save).toBeHidden();
  await page.locator("#storeTaglineInput").fill("Café de altura");
  await expect(save).toBeVisible();
});

test("the logo is picked with a real button, not the browser's file control", async ({ page }) => {
  await openSettings(page);
  await expect(page.locator("label[for=storeLogoInput]")).toHaveText("Subir logo");
  await expect(page.locator("#storeLogoInput")).toHaveClass(/sr-only/);
});

test("Marca, Envíos y retiro and Dominio open inline in the page, for the selected store", async ({ page }) => {
  await openSettings(page);
  for (const [name, section] of [["Dominio", "domain"], ["Marca", "brand"], ["Envíos y retiro", "shipping"]]) {
    await page.getByRole("tab", { name }).click();
    await expect(page.locator("#settingsPanelGeneral")).toBeHidden();
    await expect(page.locator(".settings-embed")).toBeVisible();
    await expect(page.locator(".settings-embed")).toHaveAttribute("src", `/studio/?embedded=1&library=settings&inline=1&section=${section}&store=store_1`);
  }
  // Nothing floats over the dashboard any more.
  await expect(page.locator("iframe.settings-overlay")).toHaveCount(0);
});

test("a Studio request to open Dominio lands on that tab", async ({ page }) => {
  await openSettings(page);
  // Only the Studio editor's frame may ask, so the message is sent from inside it.
  await page.evaluate(() => {
    const studio = /** @type {HTMLIFrameElement} */ (document.getElementById("merchantStudioFrame"));
    /** @type {any} */ (studio.contentWindow).eval(`parent.postMessage({ type: "pagosya:workspace", view: "store-settings", section: "domain" }, ${JSON.stringify(location.origin)})`);
  });
  await expect(page.getByRole("tab", { name: "Dominio" })).toHaveAttribute("aria-selected", "true");
});

test("at phone width the tabs scroll on their own and the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSettings(page);
  await expect(page.getByRole("heading", { name: "Identidad" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // Heading above fields: one column.
  const head = await page.locator("#storeSettingsIdentityTitle").boundingBox();
  const name = await page.locator("#storeNameInput").boundingBox();
  expect(name.y).toBeGreaterThan(head.y);
});
